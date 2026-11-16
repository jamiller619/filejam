use std::sync::{Arc, Condvar, Mutex, mpsc::SyncSender};

use crate::controller::{Event, Job};
use crate::filesystem::{PrepareError, prepare_listing};

pub struct Mailbox {
    pending: Option<Job>,
    stopping: bool,
}

pub type SharedMailbox = Arc<(Mutex<Mailbox>, Condvar)>;

pub fn new_mailbox() -> SharedMailbox {
    Arc::new((
        Mutex::new(Mailbox {
            pending: None,
            stopping: false,
        }),
        Condvar::new(),
    ))
}

pub fn submit(shared: &SharedMailbox, job: Job) {
    let (mailbox, changed) = &**shared;
    let mut mailbox = mailbox.lock().expect("worker mailbox poisoned");
    mailbox.pending = Some(job);
    drop(mailbox);
    changed.notify_one();
}

pub fn stop(shared: &SharedMailbox) {
    let (mailbox, changed) = &**shared;
    let mut mailbox = mailbox.lock().expect("worker mailbox poisoned");
    mailbox.stopping = true;
    mailbox.pending = None;
    drop(mailbox);
    changed.notify_one();
}

pub fn worker_loop(shared: SharedMailbox, sender: SyncSender<Event>) {
    worker_loop_with(shared, sender, |job| {
        prepare_listing(&job.path, &job.options, &job.cancelled, 250_000)
    });
}

fn worker_loop_with<F>(shared: SharedMailbox, sender: SyncSender<Event>, prepare: F)
where
    F: Fn(&Job) -> Result<crate::filesystem::PreparedListing, PrepareError>,
{
    loop {
        let job = {
            let (mailbox, changed) = &*shared;
            let mut mailbox = mailbox.lock().expect("worker mailbox poisoned");

            while mailbox.pending.is_none() && !mailbox.stopping {
                mailbox = changed.wait(mailbox).expect("worker mailbox poisoned");
            }

            if mailbox.stopping {
                return;
            }

            mailbox.pending.take().expect("pending job was checked")
        };

        let result = prepare(&job);
        if sender.send(Event::Prepared { id: job.id, result }).is_err() {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{new_mailbox, stop, submit, worker_loop_with};
    use crate::controller::{Event, Job};
    use crate::filesystem::{PrepareError, PreparedListing};
    use crate::protocol::{Metrics, ViewOptions};
    use std::sync::atomic::AtomicBool;
    use std::sync::{Arc, Barrier, mpsc};
    use std::thread;

    fn job(id: &str) -> Job {
        Job {
            id: id.to_owned(),
            path: String::new(),
            options: ViewOptions {
                name_contains: String::new(),
                kind: crate::protocol::KindFilter::All,
                sort_direction: crate::protocol::SortDirection::Asc,
            },
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    fn prepared() -> PreparedListing {
        PreparedListing {
            path: String::new(),
            parent_path: None,
            entries: Vec::new(),
            metrics: Metrics {
                enumeration_ms: 0.0,
                filter_sort_ms: 0.0,
            },
        }
    }

    #[test]
    fn replaces_pending_job_while_preparation_runs_without_holding_lock() {
        let shared = new_mailbox();
        let (sender, receiver) = mpsc::sync_channel(4);
        let entered_prepare = Arc::new(Barrier::new(2));
        let release_prepare = Arc::new(Barrier::new(2));
        let entered = Arc::clone(&entered_prepare);
        let release = Arc::clone(&release_prepare);
        let worker_shared = Arc::clone(&shared);
        let worker = thread::spawn(move || {
            worker_loop_with(worker_shared, sender, move |job| {
                if job.id == "A" {
                    entered.wait();
                    release.wait();
                }
                Ok(prepared())
            });
        });

        submit(&shared, job("A"));
        entered_prepare.wait();
        submit(&shared, job("B"));
        submit(&shared, job("C"));

        {
            let (mailbox, _) = &*shared;
            let mailbox = mailbox.lock().expect("worker mailbox poisoned");
            assert!(matches!(mailbox.pending.as_ref(), Some(pending) if pending.id == "C"));
        }

        release_prepare.wait();
        assert!(matches!(receiver.recv().unwrap(), Event::Prepared { id, .. } if id == "A"));
        assert!(matches!(receiver.recv().unwrap(), Event::Prepared { id, .. } if id == "C"));
        stop(&shared);
        worker.join().unwrap();
    }

    #[test]
    fn stop_wakes_worker_waiting_for_a_job() {
        let shared = new_mailbox();
        let (sender, _receiver) = mpsc::sync_channel(1);
        let worker_shared = Arc::clone(&shared);
        let worker = thread::spawn(move || {
            worker_loop_with(worker_shared, sender, |_| Err(PrepareError::Cancelled))
        });

        stop(&shared);
        worker.join().unwrap();
    }
}
