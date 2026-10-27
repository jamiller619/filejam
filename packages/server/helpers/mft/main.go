//go:build windows

package main

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

const (
	fsctlEnumUsnData        = 0x000900b3
	fsctlReadUsnJournal     = 0x000900bb
	fsctlQueryUsnJournal    = 0x000900f4
	fileAttributeDirectory  = 0x00000010
	fileReadAttributes      = 0x00000080
	fileShareRead           = 0x00000001
	fileShareWrite          = 0x00000002
	fileShareDelete         = 0x00000004
	openExisting            = 3
	fileFlagBackupSemantics = 0x02000000
	errorAccessDenied       = syscall.Errno(5)
	errorHandleEOF          = syscall.Errno(38)
	errorJournalDeleted     = syscall.Errno(1181)
	errorJournalNotActive   = syscall.Errno(1179)
	fileIDInfoClass         = 18
	swHide                  = 0
	batchSize               = 512
	metadataWorkers         = 32
	usnReasonFileCreate     = 0x00000100
	usnReasonFileDelete     = 0x00000200
	usnReasonRenameOldName  = 0x00001000
	usnReasonRenameNewName  = 0x00002000
)

var (
	kernel32                         = syscall.NewLazyDLL("kernel32.dll")
	procCreateFileW                  = kernel32.NewProc("CreateFileW")
	procDeviceIoControl              = kernel32.NewProc("DeviceIoControl")
	procGetFileInformationByHandleEx = kernel32.NewProc("GetFileInformationByHandleEx")
	procGetVolumeInformationW        = kernel32.NewProc("GetVolumeInformationW")
	shell32                          = syscall.NewLazyDLL("shell32.dll")
	procShellExecuteW                = shell32.NewProc("ShellExecuteW")
)

type fileID [16]byte

type mftEnumData struct {
	StartFileReferenceNumber uint64
	LowUsn                   int64
	HighUsn                  int64
}

type usnJournalData struct {
	JournalID       uint64
	FirstUsn        int64
	NextUsn         int64
	LowestValidUsn  int64
	MaxUsn          int64
	MaximumSize     uint64
	AllocationDelta uint64
}

type readUsnJournalData struct {
	StartUsn          int64
	ReasonMask        uint32
	ReturnOnlyOnClose uint32
	Timeout           uint64
	BytesToWaitFor    uint64
	JournalID         uint64
}

type fileIDInfo struct {
	VolumeSerialNumber uint64
	FileID             fileID
}

type record struct {
	ID         fileID
	ParentID   fileID
	Name       string
	Attributes uint32
	Reason     uint32
}

type directory struct {
	record
	relativePath string
}

type entry struct {
	Path          string `json:"path"`
	Directory     bool   `json:"directory"`
	Deleted       bool   `json:"deleted"`
	Size          int64  `json:"size"`
	ModifiedAt    int64  `json:"modifiedAt"`
	CreatedAt     int64  `json:"createdAt"`
	MetadataError string `json:"metadataError,omitempty"`
	Missing       bool   `json:"missing"`
}

type message struct {
	Type      string  `json:"type"`
	Total     int     `json:"total,omitempty"`
	Mode      string  `json:"mode,omitempty"`
	JournalID string  `json:"journalId,omitempty"`
	NextUsn   string  `json:"nextUsn,omitempty"`
	Entries   []entry `json:"entries,omitempty"`
	Error     string  `json:"error,omitempty"`
}

type batchWriter struct {
	encoder *json.Encoder
	root    string
	entries []entry
}

func main() {
	root := flag.String("root", "", "directory root to enumerate")
	pipe := flag.String("pipe", "", "named pipe used for output")
	elevate := flag.Bool("elevate", false, "request elevation if volume access is denied")
	journalID := flag.Uint64("journal-id", 0, "previous NTFS journal identifier")
	nextUsn := flag.Int64("next-usn", 0, "previous NTFS journal position")
	flag.Parse()

	if *root == "" || *pipe == "" {
		fmt.Fprintln(os.Stderr, "root and pipe are required")
		os.Exit(2)
	}

	err := run(*root, *pipe, *journalID, *nextUsn)
	if errors.Is(err, errorAccessDenied) && *elevate {
		if elevationErr := relaunchElevated(*root, *pipe, *journalID, *nextUsn); elevationErr == nil {
			return
		} else {
			err = fmt.Errorf("unable to elevate MFT helper: %w", elevationErr)
		}
	}

	if err != nil {
		writeError(*pipe, err)
		os.Exit(1)
	}
}

func run(root, pipe string, previousJournalID uint64, previousNextUsn int64) error {
	volumeRoot, volumePath, err := volumePaths(root)
	if err != nil {
		return err
	}

	if err := requireNTFS(volumeRoot); err != nil {
		return err
	}

	rootID, err := pathFileID(root)
	if err != nil {
		return fmt.Errorf("read scan-root file ID: %w", err)
	}

	volume, err := openHandle(volumePath, syscall.GENERIC_READ, 0)
	if err != nil {
		return fmt.Errorf("open NTFS volume: %w", err)
	}
	defer syscall.CloseHandle(volume)

	journal, err := queryUsnJournal(volume)
	if err != nil {
		return err
	}

	output, err := os.OpenFile(pipe, os.O_WRONLY, 0)
	if err != nil {
		return fmt.Errorf("connect output pipe: %w", err)
	}
	defer output.Close()

	writer := &batchWriter{encoder: json.NewEncoder(output), root: root}
	checkpoint := message{
		JournalID: strconv.FormatUint(journal.JournalID, 10),
		NextUsn:   strconv.FormatInt(journal.NextUsn, 10),
	}

	if previousJournalID == journal.JournalID &&
		previousNextUsn >= journal.FirstUsn &&
		previousNextUsn <= journal.NextUsn {
		incremental, safe, incrementalErr := incrementalEntries(
			volume,
			rootID,
			previousNextUsn,
			journal,
		)
		if incrementalErr != nil &&
			!errors.Is(incrementalErr, errorJournalDeleted) &&
			!errors.Is(incrementalErr, errorJournalNotActive) {
			return incrementalErr
		}

		if incrementalErr == nil && safe {
			ready := checkpoint
			ready.Type = "ready"
			ready.Total = len(incremental) + 1
			ready.Mode = "incremental"
			if err := writer.encoder.Encode(ready); err != nil {
				return err
			}

			for _, item := range incremental {
				if err := writer.add(item); err != nil {
					return err
				}
			}

			if err := writer.flush(); err != nil {
				return err
			}

			return writer.encoder.Encode(message{Type: "complete"})
		}
	}

	directories, filesByParent, err := readIndex(volume)
	if err != nil {
		return err
	}

	orderedDirectories, paths := directoryTree(rootID, directories)
	if _, found := paths[rootID]; !found {
		return errors.New("scan root was not present in the MFT enumeration")
	}

	total := subtreeTotal(orderedDirectories, paths, filesByParent)

	ready := checkpoint
	ready.Type = "ready"
	ready.Total = total
	ready.Mode = "full"
	if err := writer.encoder.Encode(ready); err != nil {
		return err
	}

	for _, directory := range orderedDirectories {
		if directory.ID == rootID {
			continue
		}

		if err := writer.add(entry{Path: directory.relativePath, Directory: true}); err != nil {
			return err
		}
	}

	if err := enumerateRecords(volume, func(item record) error {
		if item.Attributes&fileAttributeDirectory != 0 {
			return nil
		}

		parentPath, found := paths[item.ParentID]
		if !found {
			return nil
		}

		return writer.add(entry{Path: filepath.Join(parentPath, item.Name)})
	}); err != nil {
		return err
	}

	if err := writer.flush(); err != nil {
		return err
	}

	return writer.encoder.Encode(message{Type: "complete"})
}

func queryUsnJournal(volume syscall.Handle) (usnJournalData, error) {
	var journal usnJournalData
	var returned uint32
	r1, _, callErr := procDeviceIoControl.Call(
		uintptr(volume),
		fsctlQueryUsnJournal,
		0,
		0,
		uintptr(unsafe.Pointer(&journal)),
		unsafe.Sizeof(journal),
		uintptr(unsafe.Pointer(&returned)),
		0,
	)
	if r1 == 0 {
		return usnJournalData{}, fmt.Errorf("query USN journal: %w", callErr)
	}

	return journal, nil
}

func incrementalEntries(
	volume syscall.Handle,
	rootID fileID,
	startUsn int64,
	journal usnJournalData,
) ([]entry, bool, error) {
	changes, err := readJournalRecords(volume, startUsn, journal)
	if err != nil {
		return nil, false, err
	}
	if len(changes) == 0 {
		return nil, true, nil
	}

	changedIDs := make(map[fileID]struct{})
	deleted := make([]record, 0)
	structuralDirectoryReasons := uint32(
		usnReasonFileCreate |
			usnReasonFileDelete |
			usnReasonRenameOldName |
			usnReasonRenameNewName,
	)
	for _, change := range changes {
		if change.Attributes&fileAttributeDirectory != 0 {
			if change.Reason&structuralDirectoryReasons != 0 {
				// Structural directory changes alter descendant paths or parent maps.
				return nil, false, nil
			}

			continue
		}

		if change.Reason&(usnReasonFileDelete|usnReasonRenameOldName) != 0 {
			deleted = append(deleted, change)
			continue
		}

		changedIDs[change.ID] = struct{}{}
	}

	directories, _, err := readIndex(volume)
	if err != nil {
		return nil, false, err
	}
	_, paths := directoryTree(rootID, directories)
	if _, found := paths[rootID]; !found {
		return nil, false, errors.New("scan root was not present in the MFT enumeration")
	}

	items := make([]entry, 0, len(deleted)+len(changedIDs))
	seenDeleted := make(map[string]struct{})
	for _, change := range deleted {
		parentPath, found := paths[change.ParentID]
		if !found {
			return nil, false, nil
		}

		path := filepath.Join(parentPath, change.Name)
		if _, seen := seenDeleted[path]; seen {
			continue
		}

		seenDeleted[path] = struct{}{}
		items = append(items, entry{Path: path, Deleted: true})
	}

	if len(changedIDs) == 0 {
		return items, true, nil
	}

	err = enumerateRecords(volume, func(item record) error {
		if _, changed := changedIDs[item.ID]; !changed {
			return nil
		}
		if item.Attributes&fileAttributeDirectory != 0 {
			return nil
		}

		parentPath, found := paths[item.ParentID]
		if !found {
			return nil
		}

		items = append(items, entry{Path: filepath.Join(parentPath, item.Name)})
		delete(changedIDs, item.ID)

		return nil
	})
	if err != nil {
		return nil, false, err
	}

	return items, true, nil
}

func readJournalRecords(
	volume syscall.Handle,
	startUsn int64,
	journal usnJournalData,
) ([]record, error) {
	input := readUsnJournalData{
		StartUsn:   startUsn,
		ReasonMask: ^uint32(0),
		JournalID:  journal.JournalID,
	}
	buffer := make([]byte, 1024*1024)
	items := make([]record, 0)

	for input.StartUsn < journal.NextUsn {
		var returned uint32
		r1, _, callErr := procDeviceIoControl.Call(
			uintptr(volume),
			fsctlReadUsnJournal,
			uintptr(unsafe.Pointer(&input)),
			unsafe.Sizeof(input),
			uintptr(unsafe.Pointer(&buffer[0])),
			uintptr(len(buffer)),
			uintptr(unsafe.Pointer(&returned)),
			0,
		)
		if r1 == 0 {
			return nil, fmt.Errorf("read USN journal: %w", callErr)
		}
		if returned < 8 {
			return nil, errors.New("USN journal returned a truncated cursor")
		}

		nextUsn := int64(binary.LittleEndian.Uint64(buffer[:8]))
		for offset := uint32(8); offset < returned; {
			item, length, err := parseRecord(buffer[offset:returned])
			if err != nil {
				return nil, err
			}

			items = append(items, item)
			offset += length
		}

		if nextUsn <= input.StartUsn {
			break
		}
		input.StartUsn = nextUsn
	}

	return items, nil
}

func volumePaths(root string) (string, string, error) {
	clean := filepath.Clean(root)
	volume := filepath.VolumeName(clean)

	if len(volume) != 2 || volume[1] != ':' {
		return "", "", errors.New("MFT enumeration requires a drive-letter path")
	}

	return volume + `\`, `\\.\` + volume, nil
}

func requireNTFS(root string) error {
	rootPointer, err := syscall.UTF16PtrFromString(root)
	if err != nil {
		return err
	}

	fileSystem := make([]uint16, 32)
	r1, _, callErr := procGetVolumeInformationW.Call(
		uintptr(unsafe.Pointer(rootPointer)),
		0,
		0,
		0,
		0,
		0,
		uintptr(unsafe.Pointer(&fileSystem[0])),
		uintptr(len(fileSystem)),
	)
	if r1 == 0 {
		return callErr
	}

	if !strings.EqualFold(syscall.UTF16ToString(fileSystem), "NTFS") {
		return errors.New("volume is not NTFS")
	}

	return nil
}

func pathFileID(path string) (fileID, error) {
	handle, err := openHandle(path, fileReadAttributes, fileFlagBackupSemantics)
	if err != nil {
		return fileID{}, err
	}
	defer syscall.CloseHandle(handle)

	var info fileIDInfo
	r1, _, callErr := procGetFileInformationByHandleEx.Call(
		uintptr(handle),
		fileIDInfoClass,
		uintptr(unsafe.Pointer(&info)),
		unsafe.Sizeof(info),
	)
	if r1 == 0 {
		return fileID{}, callErr
	}

	return info.FileID, nil
}

func openHandle(path string, access uint32, flags uint32) (syscall.Handle, error) {
	pointer, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return syscall.InvalidHandle, err
	}

	r1, _, callErr := procCreateFileW.Call(
		uintptr(unsafe.Pointer(pointer)),
		uintptr(access),
		fileShareRead|fileShareWrite|fileShareDelete,
		0,
		openExisting,
		uintptr(flags),
		0,
	)
	handle := syscall.Handle(r1)
	if handle == syscall.InvalidHandle {
		return handle, callErr
	}

	return handle, nil
}

func readIndex(volume syscall.Handle) (map[fileID]directory, map[fileID]int, error) {
	directories := make(map[fileID]directory)
	filesByParent := make(map[fileID]int)

	err := enumerateRecords(volume, func(item record) error {
		if item.Attributes&fileAttributeDirectory != 0 {
			directories[item.ID] = directory{record: item}
		} else {
			filesByParent[item.ParentID]++
		}

		return nil
	})

	return directories, filesByParent, err
}

func directoryTree(rootID fileID, directories map[fileID]directory) ([]directory, map[fileID]string) {
	children := make(map[fileID][]directory)

	for _, item := range directories {
		if item.ID != rootID {
			children[item.ParentID] = append(children[item.ParentID], item)
		}
	}

	root, found := directories[rootID]
	if !found {
		return nil, map[fileID]string{}
	}

	root.relativePath = ""
	ordered := []directory{root}
	paths := map[fileID]string{rootID: ""}

	for index := 0; index < len(ordered); index++ {
		parent := ordered[index]

		for _, child := range children[parent.ID] {
			if _, visited := paths[child.ID]; visited {
				continue
			}

			child.relativePath = filepath.Join(parent.relativePath, child.Name)
			paths[child.ID] = child.relativePath
			ordered = append(ordered, child)
		}
	}

	return ordered, paths
}

func subtreeTotal(directories []directory, paths map[fileID]string, filesByParent map[fileID]int) int {
	total := len(directories)

	for directoryID := range paths {
		total += filesByParent[directoryID]
	}

	return total
}

func enumerateRecords(volume syscall.Handle, visit func(record) error) error {
	input := mftEnumData{HighUsn: int64(^uint64(0) >> 1)}
	buffer := make([]byte, 1024*1024)

	for {
		var returned uint32
		r1, _, callErr := procDeviceIoControl.Call(
			uintptr(volume),
			fsctlEnumUsnData,
			uintptr(unsafe.Pointer(&input)),
			unsafe.Sizeof(input),
			uintptr(unsafe.Pointer(&buffer[0])),
			uintptr(len(buffer)),
			uintptr(unsafe.Pointer(&returned)),
			0,
		)

		if r1 == 0 {
			if errors.Is(callErr, errorHandleEOF) {
				return nil
			}

			return fmt.Errorf("enumerate MFT records: %w", callErr)
		}

		if returned < 8 {
			return errors.New("MFT enumeration returned a truncated cursor")
		}

		input.StartFileReferenceNumber = binary.LittleEndian.Uint64(buffer[:8])
		for offset := uint32(8); offset < returned; {
			item, length, err := parseRecord(buffer[offset:returned])
			if err != nil {
				return err
			}

			if err := visit(item); err != nil {
				return err
			}

			offset += length
		}
	}
}

func parseRecord(data []byte) (record, uint32, error) {
	if len(data) < 8 {
		return record{}, 0, errors.New("truncated USN record header")
	}

	length := binary.LittleEndian.Uint32(data[0:4])
	major := binary.LittleEndian.Uint16(data[4:6])
	if length < 8 || uint64(length) > uint64(len(data)) {
		return record{}, 0, errors.New("invalid USN record length")
	}

	data = data[:length]
	var item record
	var nameLengthOffset int
	var nameOffsetOffset int

	switch major {
	case 2:
		if len(data) < 60 {
			return record{}, 0, errors.New("truncated USN v2 record")
		}

		copy(item.ID[:8], data[8:16])
		copy(item.ParentID[:8], data[16:24])
		item.Reason = binary.LittleEndian.Uint32(data[40:44])
		item.Attributes = binary.LittleEndian.Uint32(data[52:56])
		nameLengthOffset = 56
		nameOffsetOffset = 58
	case 3:
		if len(data) < 76 {
			return record{}, 0, errors.New("truncated USN v3 record")
		}

		copy(item.ID[:], data[8:24])
		copy(item.ParentID[:], data[24:40])
		item.Reason = binary.LittleEndian.Uint32(data[56:60])
		item.Attributes = binary.LittleEndian.Uint32(data[68:72])
		nameLengthOffset = 72
		nameOffsetOffset = 74
	default:
		return record{}, 0, fmt.Errorf("unsupported USN record version %d", major)
	}

	nameLength := int(binary.LittleEndian.Uint16(data[nameLengthOffset : nameLengthOffset+2]))
	nameOffset := int(binary.LittleEndian.Uint16(data[nameOffsetOffset : nameOffsetOffset+2]))
	if nameLength%2 != 0 || nameOffset < 0 || nameOffset+nameLength > len(data) {
		return record{}, 0, errors.New("invalid USN record filename")
	}

	nameBytes := data[nameOffset : nameOffset+nameLength]
	nameUTF16 := make([]uint16, len(nameBytes)/2)
	for index := range nameUTF16 {
		nameUTF16[index] = binary.LittleEndian.Uint16(nameBytes[index*2 : index*2+2])
	}
	item.Name = syscall.UTF16ToString(nameUTF16)

	return item, length, nil
}

func (writer *batchWriter) add(item entry) error {
	writer.entries = append(writer.entries, item)

	if len(writer.entries) < batchSize {
		return nil
	}

	return writer.flush()
}

func (writer *batchWriter) flush() error {
	if len(writer.entries) == 0 {
		return nil
	}

	batch := writer.entries
	writer.entries = writer.entries[:0]
	enrichMetadata(writer.root, batch)

	return writer.encoder.Encode(message{Type: "batch", Entries: batch})
}

func enrichMetadata(root string, entries []entry) {
	jobs := make(chan int)
	var workers sync.WaitGroup
	workerCount := metadataWorkers
	if len(entries) < workerCount {
		workerCount = len(entries)
	}

	for worker := 0; worker < workerCount; worker++ {
		workers.Add(1)
		go func() {
			defer workers.Done()

			for index := range jobs {
				item := &entries[index]
				if item.Deleted {
					continue
				}

				info, err := os.Stat(filepath.Join(root, item.Path))
				if err != nil {
					item.MetadataError = err.Error()
					item.Missing = os.IsNotExist(err)
					continue
				}

				item.Directory = info.IsDir()
				if !item.Directory {
					item.Size = info.Size()
				}
				item.ModifiedAt = info.ModTime().UnixMilli()
				item.CreatedAt = item.ModifiedAt

				if data, ok := info.Sys().(*syscall.Win32FileAttributeData); ok {
					item.CreatedAt = data.CreationTime.Nanoseconds() / int64(time.Millisecond)
				}
			}
		}()
	}

	for index := range entries {
		jobs <- index
	}
	close(jobs)
	workers.Wait()
}

func relaunchElevated(root, pipe string, journalID uint64, nextUsn int64) error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}

	operation, _ := syscall.UTF16PtrFromString("runas")
	file, _ := syscall.UTF16PtrFromString(executable)
	parameters, _ := syscall.UTF16PtrFromString(
		"--root " + quoteWindowsArgument(root) +
			" --pipe " + quoteWindowsArgument(pipe) +
			" --journal-id " + strconv.FormatUint(journalID, 10) +
			" --next-usn " + strconv.FormatInt(nextUsn, 10),
	)

	r1, _, _ := procShellExecuteW.Call(
		0,
		uintptr(unsafe.Pointer(operation)),
		uintptr(unsafe.Pointer(file)),
		uintptr(unsafe.Pointer(parameters)),
		0,
		swHide,
	)
	if r1 <= 32 {
		return syscall.Errno(r1)
	}

	return nil
}

func quoteWindowsArgument(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `\"`) + `"`
}

func writeError(pipe string, scanError error) {
	output, err := os.OpenFile(pipe, os.O_WRONLY, 0)
	if err != nil {
		fmt.Fprintln(os.Stderr, scanError)
		return
	}
	defer output.Close()

	_ = json.NewEncoder(output).Encode(message{Type: "error", Error: scanError.Error()})
}
