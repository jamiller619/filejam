use crate::protocol::{Entry, EntryKind, KindFilter, SortDirection, ViewOptions};

pub fn apply_view(entries: Vec<Entry>, options: &ViewOptions) -> Vec<Entry> {
    let needle = options.name_contains.to_lowercase();
    let mut keyed: Vec<(String, Entry)> = entries
        .into_iter()
        .filter_map(|entry| {
            let lower = entry.name.to_lowercase();
            let kind_matches = match options.kind {
                KindFilter::All => true,
                KindFilter::File => entry.kind == EntryKind::File,
                KindFilter::Directory => entry.kind == EntryKind::Directory,
            };

            if kind_matches && lower.contains(&needle) {
                Some((lower, entry))
            } else {
                None
            }
        })
        .collect();

    keyed.sort_by(|(a_lower, a), (b_lower, b)| {
        let a_group = u8::from(a.kind != EntryKind::Directory);
        let b_group = u8::from(b.kind != EntryKind::Directory);
        let group_order = a_group.cmp(&b_group);

        if group_order != std::cmp::Ordering::Equal {
            return group_order;
        }

        let name_order = (a_lower, &a.name, &a.path).cmp(&(b_lower, &b.name, &b.path));

        match options.sort_direction {
            SortDirection::Asc => name_order,
            SortDirection::Desc => name_order.reverse(),
        }
    });

    keyed.into_iter().map(|(_, entry)| entry).collect()
}

#[cfg(test)]
mod tests {
    use super::apply_view;
    use crate::protocol::{Entry, EntryKind, KindFilter, SortDirection, ViewOptions};
    use std::path::Path;

    fn fixture_entry(root: &Path, name: &str, kind: EntryKind) -> Entry {
        let path = root.join(name);
        Entry {
            path: path.to_str().unwrap().to_owned(),
            name: name.to_owned(),
            kind,
        }
    }

    fn fixture_options(value: &serde_json::Value) -> ViewOptions {
        let options = &value["options"];
        ViewOptions {
            name_contains: options["nameContains"].as_str().unwrap().to_owned(),
            kind: match options["kind"].as_str().unwrap() {
                "all" => KindFilter::All,
                "file" => KindFilter::File,
                "directory" => KindFilter::Directory,
                other => panic!("unexpected fixture kind: {other}"),
            },
            sort_direction: match options["sortDirection"].as_str().unwrap() {
                "asc" => SortDirection::Asc,
                "desc" => SortDirection::Desc,
                other => panic!("unexpected fixture direction: {other}"),
            },
        }
    }

    #[test]
    fn supplied_view_cases_match_exact_name_arrays() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/live-browser-poc/fixtures/view-cases.json"
        ))
        .unwrap();
        let root = Path::new(if cfg!(windows) {
            r"C:\fixture"
        } else {
            "/fixture"
        });
        let mut entries = fixture["directories"]
            .as_array()
            .unwrap()
            .iter()
            .map(|name| fixture_entry(root, name.as_str().unwrap(), EntryKind::Directory))
            .collect::<Vec<_>>();
        entries.extend(
            fixture["files"]
                .as_array()
                .unwrap()
                .iter()
                .map(|name| fixture_entry(root, name.as_str().unwrap(), EntryKind::File)),
        );

        for case in fixture["cases"].as_array().unwrap() {
            let actual = apply_view(entries.clone(), &fixture_options(case))
                .into_iter()
                .map(|entry| entry.name)
                .collect::<Vec<_>>();
            let expected = case["expected"]
                .as_array()
                .unwrap()
                .iter()
                .map(|name| name.as_str().unwrap().to_owned())
                .collect::<Vec<_>>();

            assert_eq!(actual, expected, "case {}", case["label"]);
        }
    }

    #[test]
    fn case_only_names_sort_a_before_a_then_reverse() {
        let entries = vec![
            Entry {
                path: "/fixture/a".to_owned(),
                name: "a".to_owned(),
                kind: EntryKind::File,
            },
            Entry {
                path: "/fixture/A".to_owned(),
                name: "A".to_owned(),
                kind: EntryKind::File,
            },
        ];
        let options = |sort_direction| ViewOptions {
            name_contains: String::new(),
            kind: KindFilter::All,
            sort_direction,
        };

        assert_eq!(
            apply_view(entries.clone(), &options(SortDirection::Asc))
                .into_iter()
                .map(|entry| entry.name)
                .collect::<Vec<_>>(),
            ["A", "a"]
        );
        assert_eq!(
            apply_view(entries, &options(SortDirection::Desc))
                .into_iter()
                .map(|entry| entry.name)
                .collect::<Vec<_>>(),
            ["a", "A"]
        );
    }

    #[test]
    fn identical_names_use_full_path_tie_breaker() {
        let entries = vec![
            Entry {
                path: "/fixture/z/same.txt".to_owned(),
                name: "same.txt".to_owned(),
                kind: EntryKind::File,
            },
            Entry {
                path: "/fixture/a/same.txt".to_owned(),
                name: "same.txt".to_owned(),
                kind: EntryKind::File,
            },
        ];
        let options = |sort_direction| ViewOptions {
            name_contains: String::new(),
            kind: KindFilter::All,
            sort_direction,
        };

        assert_eq!(
            apply_view(entries.clone(), &options(SortDirection::Asc))
                .into_iter()
                .map(|entry| entry.path)
                .collect::<Vec<_>>(),
            ["/fixture/a/same.txt", "/fixture/z/same.txt"]
        );
        assert_eq!(
            apply_view(entries, &options(SortDirection::Desc))
                .into_iter()
                .map(|entry| entry.path)
                .collect::<Vec<_>>(),
            ["/fixture/z/same.txt", "/fixture/a/same.txt"]
        );
    }
}
