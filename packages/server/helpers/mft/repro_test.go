//go:build windows && mftrepro

package main

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"
)

// Temporary helper-only reproduction. Delete this file once the helper is fixed.
// Run from this directory in an Administrator terminal:
// go test -tags mftrepro -run '^TestHelperRepro$' -count=1 -v -timeout 2m
func TestHelperRepro(t *testing.T) {
	workspace := t.TempDir()
	root := filepath.Join(workspace, "scan root")
	if err := os.MkdirAll(filepath.Join(root, "nested"), 0700); err != nil {
		t.Fatal(err)
	}

	for _, name := range []string{"hello.txt", filepath.Join("nested", "world.txt")} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("hello\n"), 0600); err != nil {
			t.Fatal(err)
		}
	}

	// A regular file isolates the native scan from named pipes and app startup.
	outputPath := filepath.Join(workspace, "messages.jsonl")
	if err := os.WriteFile(outputPath, nil, 0600); err != nil {
		t.Fatal(err)
	}

	t.Logf("Scanning %s", root)
	if err := run(root, outputPath, 0, 0); err != nil {
		t.Fatalf("helper scan failed: %v", err)
	}

	output, err := os.Open(outputPath)
	if err != nil {
		t.Fatal(err)
	}
	defer output.Close()

	expected := map[string]bool{
		"hello.txt":                          false,
		"nested":                             true,
		filepath.Join("nested", "world.txt"): false,
	}
	decoder := json.NewDecoder(output)
	ready, complete := false, false

	for {
		var event message
		if err := decoder.Decode(&event); err == io.EOF {
			break
		} else if err != nil {
			t.Fatal(err)
		}

		t.Logf("message: %+v", event)
		if complete {
			t.Fatal("received a message after complete")
		}

		switch event.Type {
		case "ready":
			if ready || event.Mode != "full" || event.Total != 4 || event.JournalID == "" || event.NextUsn == "" {
				t.Fatalf("unexpected scan metadata: %+v", event)
			}

			ready = true
		case "batch":
			if !ready {
				t.Fatal("received entries before ready")
			}

			for _, item := range event.Entries {
				directory, exists := expected[item.Path]
				if !exists || item.Directory != directory || item.Deleted || item.Missing || item.MetadataError != "" {
					t.Fatalf("unexpected entry: %+v", item)
				}
				if (!directory && item.Size != 6) || item.ModifiedAt <= 0 || item.CreatedAt <= 0 {
					t.Fatalf("incorrect metadata: %+v", item)
				}

				delete(expected, item.Path)
			}
		case "complete":
			complete = true
		default:
			t.Fatalf("unexpected message: %+v", event)
		}
	}

	if !ready || !complete || len(expected) != 0 {
		t.Fatalf("incomplete scan: ready=%t complete=%t missing=%v", ready, complete, expected)
	}
}
