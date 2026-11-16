use crate::protocol::{Entry, ErrorCode, MAX_BATCH_ENTRIES, Response, ServiceError};

#[derive(Debug)]
pub struct Batch {
    pub event: Response,
    pub next_offset: usize,
}

pub fn make_batch(
    entries: &[Entry],
    offset: usize,
    id: &str,
    max_entries: usize,
    max_bytes: usize,
) -> Result<Batch, ServiceError> {
    if offset > entries.len() {
        return Err(invalid_request("batch offset exceeds entry count"));
    }

    let entry_limit = max_entries.min(MAX_BATCH_ENTRIES);
    let mut selected = Vec::with_capacity(entry_limit.min(entries.len() - offset));
    let empty = Response::Batch {
        v: 1,
        id: id.to_owned(),
        offset,
        entries: Vec::new(),
    };
    let base_bytes = serde_json::to_vec(&empty)
        .map_err(serialization_error)?
        .len();
    let mut encoded_bytes = base_bytes;

    for entry in &entries[offset..] {
        if selected.len() == entry_limit {
            break;
        }

        let entry_bytes = serde_json::to_vec(entry).map_err(serialization_error)?;
        let candidate_bytes = encoded_bytes + usize::from(!selected.is_empty()) + entry_bytes.len();
        if candidate_bytes > max_bytes {
            break;
        }

        encoded_bytes = candidate_bytes;
        selected.push(entry.clone());
    }

    if selected.is_empty() {
        return Err(ServiceError {
            code: ErrorCode::LimitExceeded,
            message: "entry cannot fit in a batch".to_owned(),
        });
    }

    let next_offset = offset + selected.len();
    Ok(Batch {
        event: Response::Batch {
            v: 1,
            id: id.to_owned(),
            offset,
            entries: selected,
        },
        next_offset,
    })
}

fn invalid_request(message: &str) -> ServiceError {
    ServiceError {
        code: ErrorCode::InvalidRequest,
        message: message.to_owned(),
    }
}

fn serialization_error(error: serde_json::Error) -> ServiceError {
    ServiceError {
        code: ErrorCode::IoError,
        message: error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::make_batch;
    use crate::protocol::{Entry, EntryKind, ErrorCode, Response};

    fn entries(count: usize) -> Vec<Entry> {
        (0..count)
            .map(|index| Entry {
                path: format!("C:\\{index}.txt"),
                name: format!("{index}.txt"),
                kind: EntryKind::File,
            })
            .collect()
    }

    #[test]
    fn batches_are_bounded_by_entry_count_and_offsets() {
        let entries = entries(257);
        let first = make_batch(&entries, 0, "r-1", 256, MAX_BATCH_BYTES_FOR_TEST).unwrap();
        assert_eq!(batch_len(&first.event), 256);
        assert_eq!(first.next_offset, 256);

        let second = make_batch(
            &entries,
            first.next_offset,
            "r-1",
            256,
            MAX_BATCH_BYTES_FOR_TEST,
        )
        .unwrap();
        assert_eq!(batch_len(&second.event), 1);
        assert_eq!(second.next_offset, 257);
    }

    #[test]
    fn encoded_size_counts_quotes_and_backslashes() {
        let entries = vec![Entry {
            path: "C:\\folder\\\"quoted\".txt".to_owned(),
            name: "\"quoted\"\\name.txt".to_owned(),
            kind: EntryKind::File,
        }];
        let envelope = Response::Batch {
            v: 1,
            id: "r-1".to_owned(),
            offset: 0,
            entries: Vec::new(),
        };
        let base = serde_json::to_vec(&envelope).unwrap().len();
        let item = serde_json::to_vec(&entries[0]).unwrap().len();
        let exact_size = base + item;

        assert!(make_batch(&entries, 0, "r-1", 1, exact_size - 1).is_err());
        let batch = make_batch(&entries, 0, "r-1", 1, exact_size).unwrap();
        assert_eq!(batch.next_offset, 1);
        assert_eq!(serde_json::to_vec(&batch.event).unwrap().len(), exact_size);
    }

    #[test]
    fn oversized_first_entry_returns_limit_exceeded() {
        let error = make_batch(&entries(1), 0, "r-1", 1, 1).unwrap_err();
        assert!(matches!(error.code, ErrorCode::LimitExceeded));
    }

    fn batch_len(response: &Response) -> usize {
        match response {
            Response::Batch { entries, .. } => entries.len(),
            _ => panic!("expected batch response"),
        }
    }

    const MAX_BATCH_BYTES_FOR_TEST: usize = 524_288;
}
