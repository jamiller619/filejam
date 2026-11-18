use std::mem;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::batches::make_batch;
use crate::filesystem::{PrepareError, PreparedListing};
use crate::protocol::{Command, Response, ServiceError, ViewOptions, validate_list};

pub struct Job {
    pub id: String,
    pub path: String,
    pub options: ViewOptions,
    pub cancelled: Arc<AtomicBool>,
}

pub enum Event {
    Command(Command),
    Prepared {
        id: String,
        result: Result<PreparedListing, PrepareError>,
    },
    InputClosed,
    FatalInput,
}

pub enum Effect {
    Emit(Response),
    Submit(Job),
    Stop(i32),
}

pub struct Controller {
    pub active: Active,
}

pub enum Active {
    None,
    Preparing {
        id: String,
        token: Arc<AtomicBool>,
    },
    Delivering {
        id: String,
        prepared: PreparedListing,
        offset: usize,
    },
}

impl Controller {
    pub fn new() -> Self {
        Self {
            active: Active::None,
        }
    }

    fn cancel_active(&mut self) -> Vec<Effect> {
        let active = mem::replace(&mut self.active, Active::None);

        match active {
            Active::None => Vec::new(),
            Active::Preparing { id, token } => {
                token.store(true, Ordering::Relaxed);
                vec![Effect::Emit(cancelled_response(id))]
            }
            Active::Delivering { id, .. } => vec![Effect::Emit(cancelled_response(id))],
        }
    }

    pub fn handle(&mut self, event: Event) -> Vec<Effect> {
        match event {
            Event::Command(command) => self.handle_command(command),
            Event::Prepared { id, result } => self.handle_prepared(id, result),
            Event::InputClosed => self.stop(0),
            Event::FatalInput => self.stop(1),
        }
    }

    fn handle_command(&mut self, command: Command) -> Vec<Effect> {
        match command {
            Command::List {
                id, path, options, ..
            } => self.handle_list(id, path, options),
            Command::Next { id, .. } => self.handle_next(id),
            Command::Cancel { id, .. } => match &self.active {
                Active::Preparing { id: active_id, .. }
                | Active::Delivering { id: active_id, .. }
                    if active_id == &id =>
                {
                    self.cancel_active()
                }
                _ => Vec::new(),
            },
            Command::Shutdown { .. } => self.stop(0),
        }
    }

    fn handle_list(
        &mut self,
        id: String,
        path: String,
        raw_options: crate::protocol::RawOptions,
    ) -> Vec<Effect> {
        if active_id(&self.active) == Some(id.as_str()) {
            self.cancel_active();
            return vec![Effect::Stop(1)];
        }

        let options = match validate_list(&path, &raw_options) {
            Ok(options) => options,
            Err(error) => return vec![Effect::Emit(error_response(id, error))],
        };

        let mut effects = self.cancel_active();
        let token = Arc::new(AtomicBool::new(false));
        self.active = Active::Preparing {
            id: id.clone(),
            token: Arc::clone(&token),
        };
        effects.push(Effect::Submit(Job {
            id,
            path,
            options,
            cancelled: token,
        }));

        effects
    }

    fn handle_prepared(
        &mut self,
        id: String,
        result: Result<PreparedListing, PrepareError>,
    ) -> Vec<Effect> {
        if !matches!(&self.active, Active::Preparing { id: active_id, .. } if active_id == &id) {
            return Vec::new();
        }

        self.active = Active::None;
        match result {
            Err(PrepareError::Cancelled) => vec![Effect::Emit(cancelled_response(id))],
            Err(PrepareError::Error(error)) => vec![Effect::Emit(error_response(id, error))],
            Ok(prepared) => {
                let total = prepared.entries.len();
                let listing = Response::Listing {
                    v: 1,
                    id: id.clone(),
                    path: prepared.path.clone(),
                    parent_path: prepared.parent_path.clone(),
                    total,
                    metrics: prepared.metrics.clone(),
                };

                if prepared.entries.is_empty() {
                    return vec![
                        Effect::Emit(listing),
                        Effect::Emit(done_response(id, total)),
                    ];
                }

                self.active = Active::Delivering {
                    id,
                    prepared,
                    offset: 0,
                };
                vec![Effect::Emit(listing)]
            }
        }
    }

    fn handle_next(&mut self, id: String) -> Vec<Effect> {
        let active = mem::replace(&mut self.active, Active::None);
        let Active::Delivering {
            id: active_id,
            prepared,
            offset,
        } = active
        else {
            self.active = active;
            return Vec::new();
        };

        if active_id != id {
            self.active = Active::Delivering {
                id: active_id,
                prepared,
                offset,
            };
            return Vec::new();
        }

        let batch = match make_batch(
            &prepared.entries,
            offset,
            &active_id,
            crate::protocol::MAX_BATCH_ENTRIES,
            crate::protocol::MAX_BATCH_BYTES,
        ) {
            Ok(batch) => batch,
            Err(error) => return vec![Effect::Emit(error_response(active_id, error))],
        };

        let next_offset = batch.next_offset;
        let mut effects = vec![Effect::Emit(batch.event)];
        if next_offset == prepared.entries.len() {
            effects.push(Effect::Emit(done_response(
                active_id,
                prepared.entries.len(),
            )));
        } else {
            self.active = Active::Delivering {
                id: active_id,
                prepared,
                offset: next_offset,
            };
        }

        effects
    }

    fn stop(&mut self, exit_code: i32) -> Vec<Effect> {
        if let Active::Preparing { token, .. } = &self.active {
            token.store(true, Ordering::Relaxed);
        }
        self.active = Active::None;

        vec![Effect::Stop(exit_code)]
    }
}

fn active_id(active: &Active) -> Option<&str> {
    match active {
        Active::None => None,
        Active::Preparing { id, .. } | Active::Delivering { id, .. } => Some(id),
    }
}

fn cancelled_response(id: String) -> Response {
    Response::Cancelled { v: 1, id }
}

fn done_response(id: String, total: usize) -> Response {
    Response::Done { v: 1, id, total }
}

fn error_response(id: String, error: ServiceError) -> Response {
    Response::Error {
        v: 1,
        id,
        code: error.code,
        message: error.message,
    }
}

#[cfg(test)]
mod tests {
    use super::{Active, Controller, Effect, Event, Job};
    use crate::filesystem::{PrepareError, PreparedListing};
    use crate::protocol::{
        Command, Entry, EntryKind, ErrorCode, Metrics, RawOptions, Response, ServiceError,
    };
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};

    fn list(id: &str, path: &str) -> Event {
        Event::Command(Command::List {
            v: 1,
            id: id.to_owned(),
            path: path.to_owned(),
            options: RawOptions {
                name_contains: String::new(),
                kind: "all".to_owned(),
                sort_direction: "asc".to_owned(),
            },
        })
    }

    fn prepared(entries: Vec<Entry>) -> PreparedListing {
        PreparedListing {
            path: "C:\\folder".to_owned(),
            parent_path: Some("C:\\".to_owned()),
            entries,
            metrics: Metrics {
                enumeration_ms: 1.0,
                filter_sort_ms: 2.0,
            },
        }
    }

    fn one_entry() -> Vec<Entry> {
        vec![Entry {
            hidden: None,
            system: None,
            path: "C:\\folder\\item.txt".to_owned(),
            name: "item.txt".to_owned(),
            kind: EntryKind::File,
        }]
    }

    fn take_job(effects: Vec<Effect>) -> (String, Arc<AtomicBool>) {
        let mut id = None;
        let mut token = None;
        for effect in effects {
            match effect {
                Effect::Submit(job) => {
                    id = Some(job.id);
                    token = Some(job.cancelled);
                }
                Effect::Emit(Response::Cancelled { .. }) => {}
                Effect::Emit(_) => panic!("unexpected response"),
                Effect::Stop(_) => panic!("unexpected stop"),
            }
        }
        (id.unwrap(), token.unwrap())
    }

    #[test]
    fn cancelling_none_emits_nothing() {
        let mut controller = Controller::new();

        assert!(controller.cancel_active().is_empty());
        assert!(matches!(controller.active, Active::None));
    }

    #[test]
    fn cancelling_preparing_sets_token_and_emits_once_even_when_repeated() {
        let token = Arc::new(AtomicBool::new(false));
        let mut controller = Controller::new();
        controller.active = Active::Preparing {
            id: "r-1".to_owned(),
            token: Arc::clone(&token),
        };

        let effects = controller.cancel_active();

        assert!(token.load(Ordering::Relaxed));
        assert_eq!(effects.len(), 1);
        assert!(
            matches!(effects.first(), Some(Effect::Emit(Response::Cancelled { id, .. })) if id == "r-1")
        );
        assert!(controller.cancel_active().is_empty());
        assert!(matches!(controller.active, Active::None));
    }

    #[test]
    fn cancelling_delivering_emits_once_and_releases_listing() {
        let mut controller = Controller::new();
        controller.active = Active::Delivering {
            id: "r-2".to_owned(),
            prepared: crate::filesystem::PreparedListing {
                path: String::new(),
                parent_path: None,
                entries: Vec::new(),
                metrics: crate::protocol::Metrics {
                    enumeration_ms: 0.0,
                    filter_sort_ms: 0.0,
                },
            },
            offset: 0,
        };

        let effects = controller.cancel_active();

        assert_eq!(effects.len(), 1);
        assert!(
            matches!(effects.first(), Some(Effect::Emit(Response::Cancelled { id, .. })) if id == "r-2")
        );
        assert!(controller.cancel_active().is_empty());
        assert!(matches!(controller.active, Active::None));
    }

    #[test]
    fn replacing_list_cancels_previous_job_before_submitting_next() {
        let mut controller = Controller::new();
        let (id, token) = take_job(controller.handle(list("A", "C:\\one")));
        assert_eq!(id, "A");

        let effects = controller.handle(list("B", "C:\\two"));
        assert_eq!(effects.len(), 2);
        assert!(
            matches!(effects[0], Effect::Emit(Response::Cancelled { ref id, .. }) if id == "A")
        );
        assert!(matches!(effects[1], Effect::Submit(Job { ref id, .. }) if id == "B"));
        assert!(token.load(Ordering::Relaxed));
    }

    #[test]
    fn stale_prepared_is_dropped_and_current_listing_is_only_emitted() {
        let mut controller = Controller::new();
        take_job(controller.handle(list("A", "C:\\one")));
        take_job(controller.handle(list("B", "C:\\two")));

        assert!(
            controller
                .handle(Event::Prepared {
                    id: "A".to_owned(),
                    result: Ok(prepared(one_entry())),
                })
                .is_empty()
        );
        let effects = controller.handle(Event::Prepared {
            id: "B".to_owned(),
            result: Ok(prepared(one_entry())),
        });
        assert_eq!(effects.len(), 1);
        assert!(
            matches!(effects[0], Effect::Emit(Response::Listing { ref id, total: 1, .. }) if id == "B")
        );
        assert!(matches!(
            controller.active,
            Active::Delivering { offset: 0, .. }
        ));
    }

    #[test]
    fn empty_prepared_listing_emits_listing_then_done() {
        let mut controller = Controller::new();
        take_job(controller.handle(list("A", "C:\\one")));

        let effects = controller.handle(Event::Prepared {
            id: "A".to_owned(),
            result: Ok(prepared(Vec::new())),
        });
        assert_eq!(effects.len(), 2);
        assert!(matches!(
            effects[0],
            Effect::Emit(Response::Listing { total: 0, .. })
        ));
        assert!(matches!(
            effects[1],
            Effect::Emit(Response::Done { total: 0, .. })
        ));
        assert!(matches!(controller.active, Active::None));
    }

    #[test]
    fn preparation_failure_emits_error_and_clears_active() {
        let mut controller = Controller::new();
        take_job(controller.handle(list("A", "C:\\one")));

        let effects = controller.handle(Event::Prepared {
            id: "A".to_owned(),
            result: Err(PrepareError::Error(ServiceError {
                code: ErrorCode::NotFound,
                message: "missing".to_owned(),
            })),
        });
        assert!(
            matches!(effects.as_slice(), [Effect::Emit(Response::Error { id, code: ErrorCode::NotFound, .. })] if id == "A")
        );
        assert!(matches!(controller.active, Active::None));
    }

    #[test]
    fn cancel_then_late_prepared_result_is_ignored() {
        let mut controller = Controller::new();
        let (_, token) = take_job(controller.handle(list("A", "C:\\one")));

        let effects = controller.handle(Event::Command(Command::Cancel {
            v: 1,
            id: "A".to_owned(),
        }));
        assert!(
            matches!(effects.as_slice(), [Effect::Emit(Response::Cancelled { id, .. })] if id == "A")
        );
        assert!(token.load(Ordering::Relaxed));
        assert!(
            controller
                .handle(Event::Prepared {
                    id: "A".to_owned(),
                    result: Ok(prepared(one_entry())),
                })
                .is_empty()
        );
    }

    #[test]
    fn invalid_list_does_not_replace_active_job() {
        let mut controller = Controller::new();
        let (_, token) = take_job(controller.handle(list("A", "C:\\one")));
        let effects = controller.handle(list("B", "relative"));

        assert!(
            matches!(effects.as_slice(), [Effect::Emit(Response::Error { id, code: ErrorCode::InvalidRequest, .. })] if id == "B")
        );
        assert!(!token.load(Ordering::Relaxed));
        assert!(matches!(controller.active, Active::Preparing { ref id, .. } if id == "A"));
    }

    #[test]
    fn duplicate_active_id_is_fatal_without_a_second_terminal() {
        let mut controller = Controller::new();
        take_job(controller.handle(list("A", "C:\\one")));

        let effects = controller.handle(list("A", "C:\\two"));
        assert!(matches!(effects.as_slice(), [Effect::Stop(1)]));
        assert!(matches!(controller.active, Active::None));
    }
}
