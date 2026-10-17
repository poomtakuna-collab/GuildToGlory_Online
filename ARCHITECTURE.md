# Architecture: GuildToGlory Online

## สถานะของเอกสาร

เอกสารนี้เป็นข้อเสนอเบื้องต้นสำหรับแยก Client, Server และ Shared Code เทคโนโลยีที่กำหนดไว้คือ PixiJS, Colyseus, Node.js, TypeScript และ Vite รายละเอียดโครงสร้างและขอบเขตที่ยังไม่ยืนยันต้องถือเป็นข้อเสนอ ไม่ใช่ข้อกำหนดที่อนุมัติแล้ว

## ภาพรวม

- **Client (เว็บเบราว์เซอร์):** ใช้ Vite สำหรับงานพัฒนาและ build, TypeScript สำหรับโค้ด และ PixiJS สำหรับแสดงผลเกม 2D รวมถึงรับอินพุตและส่งคำสั่งของผู้เล่น
- **Server:** ใช้ Node.js, TypeScript และ Colyseus สำหรับจัดการ session/room และสื่อสารสถานะระหว่างผู้เล่น
- **Shared Code:** เก็บชนิดข้อมูลและสัญญาการสื่อสารที่ Client กับ Server ใช้ร่วมกัน โดยไม่ให้ Client เป็นผู้ตัดสินผลเกม

## การแบ่งความรับผิดชอบ

### Client

- แสดงฉาก ตัวละคร UI และเอฟเฟกต์ผ่าน PixiJS
- รับอินพุตจากผู้เล่นและส่งเป็นคำสั่งไปยัง Server
- แสดงสถานะเกมที่ได้รับจาก Server
- ไม่กำหนดผลสุดท้ายของการต่อสู้ เงิน หรือการจ้างนักผจญภัย

### Server

- เป็นผู้มีอำนาจตัดสินสถานะเกมและการต่อสู้ (authoritative server)
- ตรวจสอบสิทธิ์และความถูกต้องของคำสั่งจาก Client ก่อนประมวลผล
- คำนวณการเปลี่ยนแปลงสถานะ เช่น การใช้ Skill, AP, Cooldown และผลการต่อสู้
- กระจายสถานะที่ Server ยืนยันแล้วไปยัง Client ที่เกี่ยวข้อง

### Shared Code

- เป็นที่อยู่ของชนิดข้อมูล สัญญาคำสั่ง/ข้อความ และค่าคงที่ที่จำเป็นต้องใช้ร่วมกัน
- กฎตรวจสอบที่มีผลต่อความถูกต้องของเกมต้องถูกบังคับใช้ฝั่ง Server แม้จะมีชนิดข้อมูลหรือ helper ใช้ร่วมกัน
- ไม่เก็บโค้ดเฉพาะการเรนเดอร์ของ PixiJS หรือการเข้าถึงระบบภายในของ Server

## ลำดับการทำงานเบื้องต้น

1. Client เชื่อมต่อกับ Colyseus และเข้าร่วม session/room
2. ผู้เล่นส่งคำสั่ง เช่น การเคลื่อนที่หรือสั่งใช้ Skill ของ Leader
3. Server ตรวจสอบคำสั่งและสิทธิ์ จากนั้นคำนวณผลตามสถานะเกมปัจจุบัน
4. Server อัปเดตและกระจายสถานะที่ยืนยันแล้ว
5. Client แสดงสถานะล่าสุด โดยไม่เขียนทับผลการตัดสินของ Server

## โครงสร้างโฟลเดอร์ที่เสนอ

```text
client/   เว็บ Client, PixiJS และจุดเริ่มต้นของ Vite
server/   Node.js และ Colyseus rooms/logic
shared/   TypeScript types และสัญญาการสื่อสารร่วมกัน
```

นี่เป็นเพียงข้อเสนอสำหรับการจัดวางในอนาคต ยังไม่มีการสร้างโฟลเดอร์หรือโค้ดตามโครงสร้างนี้

## ประเด็นสถาปัตยกรรมที่ยังไม่ตัดสินใจ

- รูปแบบและการจัดเก็บสถานะของ Colyseus rooms
- ระบบยืนยันตัวตน การจับคู่ผู้เล่น และการจัดการ session
- ฐานข้อมูล การบันทึก/โหลด Guild และการย้าย schema
- ความถี่การอัปเดตสถานะและนโยบายการแก้ไข latency
- การ deploy, hosting และการจัดการ configuration/secrets
- ขอบเขตแพ็กเกจและเครื่องมือทดสอบ/build นอกเหนือจากการใช้ Vite ตามข้อเสนอ

## Implemented M4.5 World Map Foundation

The earlier sections are historical architecture proposals. The implemented M4.5
map flow is: `server/maps/registry.json` -> validated JSON map files -> server room
navigation -> `world:map` snapshot -> client texture rendering. The server sends the
same map data it uses for collision and A*, including embedded PNG assets. Reserved
maps are validated but cannot be entered. Map data is cached until server restart;
Editor maps remain local copies and are deployed only by manually replacing JSON.
No database, map transitions or persistent player position are introduced.

## Implemented M5.1 Guild Foundation

`shared/src/guild.ts` owns the versioned Guild model, initial values, name and
roster validation. RosterAdventurer extends GeneratedAdventurer with an ID without
changing generator logic. `client/src/guildStorage.ts` exposes a repository over
an injected storage adapter; loads are read-only and failed validation never resets
saved data. `client/src/guildSection.ts` owns the form and roster display, while
main.ts only integrates section navigation. This is an explicit local prototype
exception to the proposed server-owned economy, not multiplayer authority.
No recruitment, transactions, party, database or authentication is implemented.

## Implemented M5.2 Recruitment

Shared recruitment.ts produces validated immutable Guild transitions using the
unchanged generator. The storage repository applies a transition to a fresh load
and commits one complete snapshot before returning success. Guild UI serializes
create/update actions using the same Web Lock. Pending actions use the reviewed
adventurer ID; dismissal confirms that same member. Guild schema 2 reads schema 1
without resetting it and saves the migration on the next successful write.
Developer gold is client-only and gated by Vite DEV; no multiplayer protocol changes.

## Implemented M5.3 Active Party

Guild schema 3 validates ID-only activeParty references against the roster,
capacity, uniqueness and leader membership on every load and transition. Legacy
schemas 1/2 migrate in memory with an empty party, preserving other Guild data.
shared/src/party.ts owns immutable add/remove/replace/setLeader/clear transitions
and derived readiness. Recruitment dismissal removes party references in the same
transition. The existing repository validates and saves one complete snapshot;
Guild UI renders success only after storage succeeds and reloads on save failure.
The panel resolves all character details from the existing roster. This module
has no World protocol or generator dependency and adds no gameplay integration.

## Implemented M5.3.1 Session Party Identity

localProfile.ts owns a separate persistent UUID key, using a Web Lock on creation
when supported. Guild schema stays at 3 and existing IDs/economy remain unchanged.
partyNetwork.ts defines strict minimal snapshot validation and explicit projection
from Guild data. partySync.ts reloads persisted Guild data for each send and owns
a monotonic revision counter for one connection. Stopped connections cannot send.

ConnectionRoom owns one PartySessions instance with entries keyed exclusively by
transport client.sessionId. Each accepted snapshot replaces that session's entry;
non-increasing revisions and invalid payloads leave it unchanged. onLeave deletes
that entry. Summaries are broadcast on joins, accepted updates and departure, and
world:sync provides the current summary set. They omit profile IDs and progression.
World movement state and authoritative map loading remain independent.

The local identity is a self-asserted prototype label, never authentication or
permission to operate on another session. Server snapshots are ephemeral display
data, not persisted or authoritative Guild progression. Corrupt local Guild data
blocks snapshot sends and is surfaced by the World panel. Existing World navigation
still disconnects when switching sections; manual sync and cross-tab storage events
support changes during a connection without creating another session.

## Implemented M5.3.2A Server Database Foundation

server/src/database/database.ts owns the node:sqlite connection, configurable path,
foreign keys/WAL setup and synchronous transactions with nested savepoints.
migrations.ts contains versioned SQL migrations and validates applied history;
version 1 creates players, guilds, adventurers, pending_recruits, active_parties,
active_party_members and the migration ledger. Pending migrations commit atomically.
repository.ts binds SQL parameters and validates persisted generated-character data
using the existing shared parser. It does not generate characters or choose gold.

The database leader FK references party membership and is deferred until commit,
allowing atomic party replacement. Composite membership FKs enforce Guild identity;
slot constraints limit a party to four members. Roster removals cascade membership
and clear a removed leader via a trigger. Caller-level transactions can coordinate
Guild metadata, roster, pending recruit and party writes; failures roll back.
Roster capacity and ownership authorization remain future business-layer duties.

Only server startup initializes the database, with no seeding and no repository
calls from rooms. Existing browser Guild storage and network contracts are untouched.
A server-only environment setting controls the database location. Vite denies SQLite
files in development and startup rejects paths within client assets. No database
module is exported by shared code or imported in the client bundle. This foundation
has no guest authentication or automatic migration/import from browser profiles.

## Implemented M5.3.2B Guest Authentication

Migration 2 adds guest_credentials (player FK, unique SHA-256 hash, creation time).
Guests creates Player plus credential hash atomically with Node cryptographic RNG.
The HTTP /guest-account endpoint returns the secret once, with bounded input,
origin policy, no-store and per-IP/global creation limits. It seeds no Guild data.

Server startup injects Guests into an authenticated ConnectionRoom subclass through
a closure, never client options. Static Colyseus onAuth validates the Authorization
header before admission and returns only playerId into client.auth. Party snapshots
remain untrusted local display claims; they cannot set authenticated player identity.
Private guest:identity on world sync supports checking the authenticated account.

The client initializes before World matchmaking, serializes same-origin first use
with Web Locks, preserves credentials on errors, and authenticates every new session.
Guild UI/storage and current economy remain local and unchanged. No later Guild
migration, authentication recovery, movement or combat behavior is introduced.

## Implemented M5.3.2C1 Authoritative Guild Management

GuildService is a business layer between the HTTP adapter and GuildRepository. The
HTTP adapter authenticates every request with Guests and provides only verified
playerId to the service. Shared guildApi.ts strictly validates command allowlists.
Recruitment and Party reuse existing transitions; generation executes on the server.
Repository aggregate snapshot reads/writes keep references and metadata consistent.

Migration 3 stores account-scoped revisions and durable command receipts. Commands
use a transaction plus nested savepoints, fingerprint-based idempotency and revision
checks; outcomes commit with changes, including gold/pending and dismissal/party.
Read responses and duplicate outcomes include latest state. Stale commands cannot
silently overwrite another tab's changes. No World-session exclusivity is imposed.

Client Guild UI depends on an async API adapter, retains server-confirmed data on
errors and persists unresolved request envelopes in sessionStorage for safe retries.
Legacy localStorage is read only after explicit Preview, and import requires a
confirmation plus server development/opt-in gates. Debug gold is also server-gated.
Guild creation is separate from import; no automatic browser migration occurs.
World movement/room state is unchanged. Session display Party snapshots are never
passed into the persistence service; C2 session takeover remains out of scope.
