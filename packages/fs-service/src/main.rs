use std::io::{self, BufReader, BufWriter, Write};
use std::process::ExitCode;
use std::sync::mpsc::{self, SyncSender};
use std::thread;

use filejam_fs_service::controller::{Controller, Effect, Event};
use filejam_fs_service::line_reader::read_frame;
use filejam_fs_service::protocol::{Response, decode_command};
use filejam_fs_service::worker::{new_mailbox, stop, submit, worker_loop};

fn main() -> ExitCode {
    if std::env::args().nth(1).as_deref() == Some("--operations") {
        return match filejam_fs_service::operations::run() {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("operation worker failed: {error}");
                ExitCode::FAILURE
            }
        };
    }

    let (sender, receiver) = mpsc::sync_channel(32);
    let mailbox = new_mailbox();

    spawn_reader(sender.clone());
    let worker_mailbox = mailbox.clone();
    let worker_sender = sender;
    thread::spawn(move || worker_loop(worker_mailbox, worker_sender));

    let stdout = io::stdout();
    let mut output = BufWriter::new(stdout.lock());
    if let Err(error) = write_response(&mut output, Response::Ready { v: 1 }) {
        eprintln!("failed to write ready response: {error}");
        stop(&mailbox);
        return ExitCode::FAILURE;
    }

    let mut controller = Controller::new();
    while let Ok(event) = receiver.recv() {
        let effects = controller.handle(event);

        for effect in effects {
            match effect {
                Effect::Emit(response) => {
                    if let Err(error) = write_response(&mut output, response) {
                        eprintln!("failed to write protocol response: {error}");
                        stop(&mailbox);
                        return ExitCode::FAILURE;
                    }
                }
                Effect::Submit(job) => submit(&mailbox, job),
                Effect::Stop(code) => {
                    stop(&mailbox);
                    return if code == 0 {
                        ExitCode::SUCCESS
                    } else {
                        ExitCode::FAILURE
                    };
                }
            }
        }
    }

    stop(&mailbox);
    ExitCode::FAILURE
}

fn spawn_reader(sender: SyncSender<Event>) {
    thread::spawn(move || {
        let stdin = io::stdin();
        let mut input = BufReader::new(stdin.lock());

        loop {
            let event = match read_frame(&mut input) {
                Ok(None) => Event::InputClosed,
                Ok(Some(frame)) => match decode_command(&frame) {
                    Ok(command) => Event::Command(command),
                    Err(error) => {
                        eprintln!("invalid protocol input: {}", error.message);
                        Event::FatalInput
                    }
                },
                Err(error) => {
                    eprintln!("failed to read protocol input: {}", error.message);
                    Event::FatalInput
                }
            };
            let finished = matches!(event, Event::InputClosed | Event::FatalInput);

            if sender.send(event).is_err() || finished {
                return;
            }
        }
    });
}

fn write_response(output: &mut impl Write, response: Response) -> io::Result<()> {
    serde_json::to_writer(&mut *output, &response)?;
    output.write_all(b"\n")?;
    output.flush()
}
