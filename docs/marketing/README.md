# Marketing Log

Parasitic distribution log — Reddit / Facebook / Quora / Zillow comment replies
targeting high-intent Houston relocation searchers. See Apocalypsee's playbook
in Slack #marketing for strategy.

## Layout

- `daily/YYYY-MM-DD.md` — one file per day. Every reply sent, one row.
- `templates/` — reusable answer templates (school-district, commute-Downtown,
  Chinese-community, $400k first-time, 55+ retirement, …). Never copy-paste
  verbatim — always rewrite for the OP.
- `accounts.md` — account handles + karma history (Reddit / FB group / Quora).
  Do NOT commit passwords or emails.

## Daily file format

Copy `daily/_template.md` at the start of each day. Fields per reply:

| field | notes |
|---|---|
| time | HH:MM UTC |
| source | reddit / fb-group / quora / zillow / realtor |
| url | full permalink to the post |
| op-question | one-line summary of what the OP asked |
| account | which handle sent the reply |
| reply-summary | 1-2 lines, key subdivisions mentioned + whether Percho link included |
| link? | yes / no (never on new accounts, never with utm_) |
| outcome | 24h later: upvotes / downvotes / removed / replies / clicks if trackable |

## Rules (from playbook + memory)

1. No fresh account + Percho link on day 1 — shadowban risk. Age 7-10d, 100+ karma first.
2. 80% real info, 20% soft mention. Percho pitch is one sentence, honest, "still early".
3. Never `utm_*` params — kills the link through Reddit's spam filter.
4. Rewrite every reply for the OP's actual budget / kids / commute — no templated dumps.
5. F5Bot hit → respond within 4h. Early replies dominate long-tail traffic.
6. Facebook groups: 5 days lurk + like, then reply to others, NEVER post.

## Weekly review

Every Sunday, append a short block to the newest daily file:

- replies sent this week
- top 3 upvoted / most-replied threads
- estimated clicks (from server logs if link included)
- what tone / opening line worked, what got downvoted
