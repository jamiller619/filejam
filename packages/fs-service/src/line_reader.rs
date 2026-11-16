use std::io::BufRead;

use crate::protocol::{MAX_LINE_BYTES, ProtocolError};

/// Reads one LF-delimited frame while keeping the payload allocation bounded.
pub fn read_frame<R: BufRead>(reader: &mut R) -> Result<Option<Vec<u8>>, ProtocolError> {
    let mut frame = Vec::new();

    loop {
        let available = reader.fill_buf().map_err(|error| ProtocolError {
            message: error.to_string(),
        })?;

        if available.is_empty() {
            return if frame.is_empty() {
                Ok(None)
            } else {
                Err(ProtocolError {
                    message: "incomplete frame at end of input".to_owned(),
                })
            };
        }

        let line_end = available.iter().position(|byte| *byte == b'\n');
        let consumed = line_end.unwrap_or(available.len());
        let payload_from_buffer = consumed
            - usize::from(
                line_end.is_some() && available.get(consumed.wrapping_sub(1)) == Some(&b'\r'),
            );
        let strip_cr = line_end.is_some()
            && (frame.last() == Some(&b'\r')
                || available.get(consumed.wrapping_sub(1)) == Some(&b'\r'));
        let payload_length = frame.len() + consumed - usize::from(strip_cr);

        if payload_length > MAX_LINE_BYTES {
            return Err(ProtocolError {
                message: "frame exceeds maximum line length".to_owned(),
            });
        }

        if let Some(end) = line_end {
            frame.extend_from_slice(&available[..payload_from_buffer]);
            reader.consume(end + 1);

            if frame.last() == Some(&b'\r') {
                frame.pop();
            }

            return Ok(Some(frame));
        }

        frame.extend_from_slice(&available[..consumed]);
        reader.consume(consumed);
    }
}

#[cfg(test)]
mod tests {
    use std::io::{self, BufRead, Read};

    use crate::protocol::{MAX_LINE_BYTES, decode_command};

    use super::read_frame;

    struct OneByteReader<R>(R);

    impl<R: BufRead> Read for OneByteReader<R> {
        fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
            let length = buffer.len().min(1);
            self.0.read(&mut buffer[..length])
        }
    }

    impl<R: BufRead> BufRead for OneByteReader<R> {
        fn fill_buf(&mut self) -> io::Result<&[u8]> {
            let buffer = self.0.fill_buf()?;
            Ok(&buffer[..buffer.len().min(1)])
        }

        fn consume(&mut self, amount: usize) {
            self.0.consume(amount.min(1));
        }
    }

    #[test]
    fn reads_one_byte_chunks_and_preserves_later_lines() {
        let input = b"{\"v\":1,\"type\":\"next\",\"id\":\"r-1\"}\n{\"v\":1,\"type\":\"next\",\"id\":\"r-2\"}\n";
        let mut reader = OneByteReader(io::Cursor::new(input));

        assert_eq!(
            read_frame(&mut reader).unwrap().unwrap(),
            input[..input.iter().position(|b| *b == b'\n').unwrap()]
        );
        assert_eq!(
            read_frame(&mut reader).unwrap().unwrap(),
            b"{\"v\":1,\"type\":\"next\",\"id\":\"r-2\"}"
        );
        assert_eq!(read_frame(&mut reader).unwrap(), None);
    }

    #[test]
    fn crlf_and_split_multibyte_bytes_are_preserved() {
        let bytes = "{\"name\":\"é\"}\r\n".as_bytes();
        let mut reader = OneByteReader(io::Cursor::new(bytes));
        assert_eq!(
            read_frame(&mut reader).unwrap().unwrap(),
            "{\"name\":\"é\"}".as_bytes()
        );
    }

    #[test]
    fn enforces_cap_and_partial_eof() {
        let mut exact = vec![b'x'; MAX_LINE_BYTES];
        exact.push(b'\n');
        assert_eq!(
            read_frame(&mut io::BufReader::new(exact.as_slice()))
                .unwrap()
                .unwrap()
                .len(),
            MAX_LINE_BYTES
        );

        let mut too_long = vec![b'x'; MAX_LINE_BYTES + 1];
        too_long.push(b'\n');
        assert!(read_frame(&mut io::BufReader::new(too_long.as_slice())).is_err());
        assert!(read_frame(&mut io::BufReader::new(b"partial".as_slice())).is_err());
    }

    #[test]
    fn invalid_utf8_is_rejected_by_command_decode() {
        let frame = read_frame(&mut io::BufReader::new(
            b"{\"v\":1,\"type\":\"next\",\"id\":\"\xff\"}\n".as_slice(),
        ))
        .unwrap()
        .unwrap();
        assert!(decode_command(&frame).is_err());
    }
}
