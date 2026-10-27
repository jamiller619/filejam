//go:build windows

package main

import (
	"encoding/binary"
	"testing"
	"unicode/utf16"
)

func TestParseRecordIncludesJournalReason(t *testing.T) {
	name := utf16.Encode([]rune("example.txt"))
	recordLength := 60 + len(name)*2
	data := make([]byte, recordLength)

	binary.LittleEndian.PutUint32(data[0:4], uint32(recordLength))
	binary.LittleEndian.PutUint16(data[4:6], 2)
	binary.LittleEndian.PutUint64(data[8:16], 42)
	binary.LittleEndian.PutUint64(data[16:24], 7)
	binary.LittleEndian.PutUint32(data[40:44], usnReasonRenameOldName)
	binary.LittleEndian.PutUint16(data[56:58], uint16(len(name)*2))
	binary.LittleEndian.PutUint16(data[58:60], 60)
	for index, character := range name {
		binary.LittleEndian.PutUint16(data[60+index*2:], character)
	}

	item, length, err := parseRecord(data)
	if err != nil {
		t.Fatal(err)
	}
	if length != uint32(recordLength) {
		t.Fatalf("length = %d, want %d", length, recordLength)
	}
	if item.Name != "example.txt" {
		t.Fatalf("name = %q", item.Name)
	}
	if item.Reason != usnReasonRenameOldName {
		t.Fatalf("reason = %#x", item.Reason)
	}
}
