CREATE TRIGGER restore_inserted_icon AFTER INSERT ON entries
BEGIN
  INSERT OR REPLACE INTO entry_appearance(entry_id, icon)
    SELECT NEW.id, icon FROM pending_appearance
    WHERE library_id = NEW.library_id AND relative_path = NEW.relative_path;
  DELETE FROM pending_appearance
    WHERE library_id = NEW.library_id AND relative_path = NEW.relative_path;
END;
--> statement-breakpoint
CREATE TRIGGER restore_updated_icon AFTER UPDATE ON entries
BEGIN
  INSERT OR REPLACE INTO entry_appearance(entry_id, icon)
    SELECT NEW.id, icon FROM pending_appearance
    WHERE library_id = NEW.library_id AND relative_path = NEW.relative_path;
  DELETE FROM pending_appearance
    WHERE library_id = NEW.library_id AND relative_path = NEW.relative_path;
END;
