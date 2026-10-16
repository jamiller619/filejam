import { sql } from 'drizzle-orm'
import { entries } from '../db/schemas/entry.js'

/** Sum indexed descendants without following symlink targets. */
export const entrySize = sql<number | null>`case
  when ${entries.kind} != 'directory' then ${entries.size}
  else (
    with recursive contents(id, kind, size) as (
      select id, kind, size from entries as child
      where child.parent_id = "entries"."id"
        and child.library_id = "entries"."library_id"
      union all
      select child.id, child.kind, child.size
      from entries as child join contents on child.parent_id = contents.id
      where contents.kind = 'directory'
        and child.library_id = "entries"."library_id"
    )
    select coalesce(sum(case when kind != 'directory' then size else 0 end), 0)
    from contents
  )
end`
