import { sql } from 'drizzle-orm'
import { entries } from '../db/schemas/entry.js'

/** Sum indexed descendants without following symlink targets. */
export const entrySize = sql<number | null>`case
  when ${entries.kind} != 'directory' then ${entries.size}
  when ${entries.childrenDirty} or ${entries.childrenScannedAt} is null then null
  else (
    with recursive contents(id, kind, size, children_dirty, children_scanned_at) as (
      select id, kind, size, children_dirty, children_scanned_at from entries as child
      where child.parent_id = "entries"."id"
        and child.volume_id = "entries"."volume_id"
      union all
      select child.id, child.kind, child.size, child.children_dirty, child.children_scanned_at
      from entries as child join contents on child.parent_id = contents.id
      where contents.kind = 'directory'
        and child.volume_id = "entries"."volume_id"
    )
    select case
      when max(case
        when kind = 'directory' and (children_dirty or children_scanned_at is null)
          then 1
        else 0
      end) = 1 then null
      else coalesce(sum(case when kind != 'directory' then size else 0 end), 0)
    end
    from contents
  )
end`
