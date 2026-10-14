# Game Design: GuildToGlory Online

## สถานะของเอกสาร

เอกสารนี้แยกกฎที่ยืนยันแล้วออกจากรายละเอียดที่ยังไม่ตัดสินใจ ห้ามถือข้อเสนอหรือคำถามปลายเปิดเป็นกฎเกมโดยไม่ได้รับการยืนยัน

## กฎที่ยืนยันแล้ว

### แนวเกมและ Guild

- เป็นเกม 2D Guild MMORPG ที่เล่นบนเว็บ
- ผู้เล่นบริหาร Guild ซึ่งรองรับนักผจญภัยได้สูงสุด 8 คน
- Active Party มีสมาชิกได้สูงสุด 4 คน
- เงินเริ่มต้นของผู้เล่นคือ 40,000 G

### นักผจญภัยและการจ้าง

- ผู้เล่นจ้างนักผจญภัยจากโรงเตี้ยมด้วยการสุ่ม โดยมีราคาขั้นต่ำ 10,000 G
- นักผจญภัยทุกคนเป็นมนุษย์ เริ่มที่ Level 1 และไม่มี Class
- Generator สุ่มชื่อนักผจญภัยและ Rarity จาก 5 ระดับ: Common (ขาว), Uncommon (เขียว), Rare (ฟ้า), Epic (ม่วง), Legendary (ทอง)
- Rarity ไม่มี Growth bonus ทั้งใน Prototype และเกมจริงในอนาคต
- Stats ของนักผจญภัยมี STR, AGI, VIT, DEX, INT และ LUK
- Generator สุ่ม Aptitude, Traits และ Personality โดย Traits กับ Personality สุ่มแยกจากกัน
- Generator ใช้ Stats ที่สร้างขึ้นกำหนด Skill Pool ที่มีสิทธิ์ได้รับ ทั้ง Active Skills และ Passive Skills จากนั้นสุ่ม Skill เริ่มต้นที่ไม่ซ้ำกัน 1–4 Skills โดยมีโอกาสได้ 1 Skill 50%, 2 Skills 30%, 3 Skills 15% และ 4 Skills 5%; จำนวน Skill เริ่มต้นไม่ขึ้นกับ Rarity
- ระหว่างการสร้างตัวละคร Level 1, Base Stats ไม่ปลดล็อก Skills เพิ่มเมื่อถึง multiple of 5; Generator มอบเฉพาะ Skills เริ่มต้น 1–4 รายการข้างต้น

### การพัฒนาและ Skill Orbs

- เก็บ Base Stats แยกจาก Stats ที่ผู้เล่นจัดสรร
- Effective Stat = Base Stat + Allocated Stat
- หลังสร้างตัวละคร เมื่อ Stats ที่ผู้เล่นจัดสรรทำให้ Effective Stat ข้าม multiple of 5 ใหม่ ให้สุ่มปลดล็อก Skill หนึ่งรายการจาก Skill Pool ที่มีสิทธิ์ของ Stat นั้น
- ทุก ๆ 2 แต้มที่ผู้เล่นจัดสรรให้ Stat รายตัว จะได้รับ Skill Orb 1 ลูกจาก Pool ของ Stat เดียวกัน
- Stat points ที่สุ่มให้ตอนสร้างตัวละครไม่ให้ Skill Orbs
- Skill Orbs ใช้ Upgrade ได้เฉพาะ Skills ที่อยู่ใน Pool ของ Stat ต้นสังกัด
- มีแผนให้ Reroll Skill ด้วย Item ร่วมกับเงินในเกม แต่ค่าใช้จ่ายและข้อจำกัดยังไม่กำหนด

### ค่าต้นแบบ M3.1 เท่านั้น

ค่าต่อไปนี้เป็นค่าชั่วคราวสำหรับ Adventurer Generator Prototype ของ M3.1 เท่านั้น ไม่ใช่ค่าที่สรุปสำหรับเกมจริง และใช้แทนร่าง M3 ก่อนหน้าที่กำหนด Stat Pool 100 แต้มให้ทุก Rarity:

- Stat Pool และโอกาสสุ่ม Rarity ของ Prototype: Common 70 แต้ม (25%, White), Uncommon 75 แต้ม (25%, Green), Rare 80 แต้ม (20%, Blue), Epic 90 แต้ม (20%, Purple), Legendary 100 แต้ม (10%, Gold)
- สุ่มกระจาย Stat Pool ให้ STR, AGI, VIT, DEX, INT และ LUK โดยแต่ละ Stat อยู่ระหว่าง 1–30 และไม่มี Archetypes ที่กำหนดไว้ล่วงหน้า
- ค่าที่สุ่มได้เป็น Base Stats และผลรวมต้องเท่ากับ Stat Pool ของ Rarity ที่สุ่มได้
- ไม่มี Growth bonus จาก Rarity; Stat Pool เริ่มต้นที่ต่างกันเป็นเพียงค่าต้นแบบชั่วคราว

### ค่าต้นแบบ M3.2 Balance V3 เท่านั้น

กฎในส่วนนี้เป็นค่าชั่วคราว Balance V3 สำหรับ Skill Generator Prototype ของ M3.2 ไม่ใช่กฎถาวรหรือค่าที่สรุปสำหรับเกมจริง และวิธีสุ่ม Skills ส่วนนี้ใช้แทนวิธีสุ่มจำนวน Skill เริ่มต้นแบบคงที่ใน M3.1 เฉพาะ Prototype:

- มี Placeholder Skills รวม 60 Skills แบ่งเป็น 6 Stat Pools: STR ใช้ `ดาบ A`–`ดาบ J`, AGI ใช้ `หลบ A`–`หลบ J`, VIT ใช้ `ป้องกัน A`–`ป้องกัน J`, DEX ใช้ `ธนู A`–`ธนู J`, INT ใช้ `เวท A`–`เวท J` และ LUK ใช้ `โชค A`–`โชค J`; ยังไม่มี Combat effects, AP, Damage, Cooldowns หรือ Skill upgrades
- หลังสร้าง Base Stats ให้เรียง Stat จากค่าสูงไปต่ำ และใช้ลำดับ STR, AGI, VIT, DEX, INT, LUK เป็นตัวตัดสินเมื่อค่าเท่ากัน
- Stat ค่า 1–10 ได้ 2 Roll Attempts; ค่า 11–20 ได้ 4; ค่า 21–30 ได้ 4
- Starting Skill chance ตาม Rarity และจำนวน Skill ที่ได้แล้ว (0 / 1 / 2 / 3): Common 15% / 4% / 1% / 0.2%, Uncommon 20% / 6% / 1.5% / 0.4%, Rare 25% / 8% / 2% / 0.6%, Epic 30% / 10% / 3% / 1%, Legendary 35% / 12% / 4% / 1.5%
- Roll ที่ไม่สำเร็จเพิ่ม Failure Bonus 1 percentage point ให้ Roll ถัดไป; Bonus สะสมต่อเนื่องเมื่อเปลี่ยน Stat Pool และ reset เป็น 0 เมื่อได้ Skill สำเร็จ; Actual chance = Base Chance + Failure Bonus โดยจำกัดในช่วง 0%–100%
- Skill จาก Stat Pool เดิมสามารถถูกเลือกได้หลายครั้ง แต่ Skill ID ภายในตัวละครเดียวกันห้ามซ้ำ; หลัง Acquisition roll สำเร็จ ให้สุ่ม Tier A–J ใหม่เมื่อ Skill ใน Tier ที่เลือกถูกครอบครองแล้ว โดยการสุ่มซ้ำไม่ใช้ Acquisition Attempt เพิ่มและไม่เปลี่ยน Chance หรือ Failure Bonus
- การสุ่ม Tier ซ้ำจำกัดจำนวนครั้งเพื่อป้องกัน Infinite loop; หากยังไม่พบ Skill ที่ไม่ซ้ำ ให้เลือก Skill ID ที่ยังไม่ถูกครอบครองจาก Stat Pool ปัจจุบันเป็น Safe fallback; หาก Stat Pool นั้นไม่มี Skill ที่เลือกได้ จะไม่เพิ่ม Skill ซ้ำและดำเนิน Attempt ตามปกติ
- ได้ Starting Skills สูงสุด 4 Skills ที่มี ID ไม่ซ้ำ; ถ้าไม่มี Skill หลัง Roll Attempt สุดท้าย ให้รับประกัน 1 Skill จาก Stat Pool ของ Attempt สุดท้ายนั้น
- หลัง Roll สำเร็จ ให้สุ่ม Tier A–J แยกจาก Skill acquisition chance โดยใช้ Stat value เลือกแถว Weight; ทุก Tier ต้องมีโอกาสมากกว่า 0 และแต่ละแถว normalize ขณะทำงานให้ผลรวมเท่ากับ 100%
- ตาราง V2 ต่อไปนี้เป็น Provisional tier weights ตามลำดับคอลัมน์ A–J; ค่าเหล่านี้ไม่ใช่ Final game balance:

| Stat bracket | A | B | C | D | E | F | G | H | I | J |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1–10 | 85 | 9 | 3 | 1.5 | 0.7 | 0.35 | 0.2 | 0.12 | 0.08 | 0.05 |
| 11–20 | 18 | 65 | 12 | 3 | 1 | 0.5 | 0.2 | 0.15 | 0.1 | 0.05 |
| 21–30 | 6 | 22 | 60 | 8 | 2 | 1 | 0.4 | 0.3 | 0.2 | 0.1 |
| 31–40 | 2 | 7 | 22 | 59 | 7 | 1.5 | 0.7 | 0.4 | 0.25 | 0.15 |
| 41–50 | 0.5 | 2 | 7 | 22 | 59 | 7 | 1.5 | 0.6 | 0.25 | 0.15 |
| 51–60 | 0.2 | 0.5 | 2 | 7 | 22 | 59 | 7 | 1.5 | 0.5 | 0.3 |
| 61–70 | 0.15 | 0.2 | 0.5 | 2 | 7 | 22 | 59 | 7 | 1.5 | 0.65 |
| 71–80 | 0.1 | 0.15 | 0.25 | 0.5 | 2 | 7 | 22 | 59 | 7 | 2 |
| 81–90 | 0.1 | 0.1 | 0.15 | 0.25 | 0.5 | 2 | 7 | 22 | 60 | 7.9 |
| 91–100 | 0.05 | 0.08 | 0.12 | 0.2 | 0.35 | 0.7 | 1.5 | 3 | 9 | 85 |

- Stat brackets 1–10 ถึง 91–100 ให้ Tier ที่มีตัวอักษรเดียวกับช่วงสิบเป็น Tier ที่มี Weight สูงสุด ตั้งแต่ A ถึง J ตามลำดับ

### ค่าต้นแบบ M3.3 Trait Generator V1 เท่านั้น

กฎต่อไปนี้เป็น Prototype V1 สำหรับ Trait Generator ของ M3.3 เท่านั้น ไม่ใช่กฎถาวรหรือค่าที่สรุปสำหรับเกมจริง; ระบบนี้สร้างข้อมูล Traits แต่ยังไม่ประยุกต์ผลกับ Stats, Damage, HP, AP หรือ Combat:

- Trait แต่ละรายการเก็บ Unique ID, Name, Category, Type (`positive` หรือ `negative`), Individual Roll Probability, Description, Structured Gameplay Effects หนึ่งรายการขึ้นไป และรายการ ID ของ Traits ที่ขัดแย้งกัน
- Registry เป็นศูนย์กลางข้อมูลและเพิ่ม Traits ใหม่ได้โดยไม่ต้องแก้ Generator; ค่า Effect เป็นข้อมูลเท่านั้น ไม่ใช่การคำนวณ Gameplay
- Trait ทั้ง 30 รายการใน Prototype ใช้ Initial roll probability 8% ต่อรายการ โดยค่า probability ปรับแยกเป็นราย Trait ได้
- ทุกครั้งที่ Generate ให้ Shuffle Registry แล้ว Roll แต่ละ Trait แยกจากกัน; หาก Trait ขัดแย้งกับ Trait ที่เลือกแล้ว ให้ข้ามรายการนั้น; ID ซ้ำห้ามถูกเลือกซ้ำ
- ไม่มีจำนวน Traits ขั้นต่ำหรือสูงสุดที่กำหนดไว้; จำนวนสูงสุดมาจากรายการใน Registry และกฎ Conflict เท่านั้น
- การสุ่ม Traits เป็นอิสระจาก Rarity, Stats และ Skills และไม่มี Positive/Negative point budget
- Trait ที่ขัดแย้งกันเป็นคู่ตรงข้ามดังตาราง; คู่ Conflict มีผลทั้งสองทิศทาง:

| ID | Trait | Category | Type | Structured effect | Conflicts with |
|---|---|---|---|---|---|
| `strong` | Strong | offense | positive | `meleeDamage`, percentage +2% | `weak` |
| `agile` | Agile | mobility | positive | `movementSpeed`, percentage +2% | `clumsy` |
| `tough` | Tough | survivability | positive | `maxHp`, percentage +2% | `frail` |
| `brave` | Brave | resistance | positive | `fearResistance`, percentage +5% | `coward` |
| `fast-learner` | Fast Learner | progression | positive | `experienceGain`, percentage +2% | `slow-learner` |
| `keen-eyes` | Keen Eyes | perception | positive | `visionRange`, percentage +3% | `short-sighted` |
| `animal-lover` | Animal Lover | creatures | positive | `beastDamageTaken`, percentage -5% | `beast-phobia` |
| `beast-hunter` | Beast Hunter | creatures | positive | `beastDamage`, percentage +5% | `poor-hunter` |
| `fire-resistant` | Fire Resistant | elements | positive | `fireDamageTaken`, percentage -3% | `fire-vulnerable` |
| `cold-resistant` | Cold Resistant | elements | positive | `coldDamageTaken`, percentage -3% | `cold-vulnerable` |
| `quick-recovery` | Quick Recovery | recovery | positive | `hpRegeneration`, percentage +2% | `slow-recovery` |
| `efficient` | Efficient | action-points | positive | `apCost`, percentage -2% | `wasteful` |
| `treasure-hunter` | Treasure Hunter | loot | positive | `rareLootChance`, percentage +1% | `unlucky-finder` |
| `night-owl` | Night Owl | time | positive | `nightMovementSpeed`, percentage +3% | `sleepyhead` |
| `focused` | Focused | accuracy | positive | `skillAccuracy`, percentage +2% | `distracted` |
| `weak` | Weak | offense | negative | `meleeDamage`, percentage -2% | `strong` |
| `clumsy` | Clumsy | mobility | negative | `movementSpeed`, percentage -2% | `agile` |
| `frail` | Frail | survivability | negative | `maxHp`, percentage -2% | `tough` |
| `coward` | Coward | resistance | negative | `fearResistance`, percentage -5% | `brave` |
| `slow-learner` | Slow Learner | progression | negative | `experienceGain`, percentage -2% | `fast-learner` |
| `short-sighted` | Short Sighted | perception | negative | `visionRange`, percentage -3% | `keen-eyes` |
| `beast-phobia` | Beast Phobia | creatures | negative | `beastDamageTaken`, percentage +5% | `animal-lover` |
| `poor-hunter` | Poor Hunter | creatures | negative | `beastDamage`, percentage -5% | `beast-hunter` |
| `fire-vulnerable` | Fire Vulnerable | elements | negative | `fireDamageTaken`, percentage +3% | `fire-resistant` |
| `cold-vulnerable` | Cold Vulnerable | elements | negative | `coldDamageTaken`, percentage +3% | `cold-resistant` |
| `slow-recovery` | Slow Recovery | recovery | negative | `hpRegeneration`, percentage -2% | `quick-recovery` |
| `wasteful` | Wasteful | action-points | negative | `apCost`, percentage +2% | `efficient` |
| `unlucky-finder` | Unlucky Finder | loot | negative | `rareLootChance`, percentage -1% | `treasure-hunter` |
| `sleepyhead` | Sleepyhead | time | negative | `nightMovementSpeed`, percentage -3% | `night-owl` |
| `distracted` | Distracted | accuracy | negative | `skillAccuracy`, percentage -2% | `focused` |

### การควบคุมและการต่อสู้

- ผู้เล่นควบคุม Leader โดยตรง
- สมาชิกคนอื่นใน Party เดินตาม Leader และต่อสู้อัตโนมัติ
- Leader ใช้ระบบ Semi Auto Combat: ผู้เล่นสั่งใช้ Skill ของ Leader เองได้
- การต่อสู้เป็นแบบ Real-time และใช้ AP กับ Skill Cooldown
- ไม่มีระบบการ์ดและไม่มีการต่อสู้แบบเทิร์น

## ยังไม่กำหนด / ต้องยืนยันเพิ่มเติม

รายการต่อไปนี้ยังไม่มีข้อสรุปสำหรับเกมจริง จึงไม่ควรนำค่าต้นแบบ M3 ไปถือเป็นกฎหรือค่าคงที่ของเกมจริง:

- Stat pool รวม, Stat cap, วิธีจัดสรร Stats และ Level-up rewards
- อัตราการสุ่ม Rarity และผลของ Rarity ต่อ Stat pool เริ่มต้นในเกมจริง (Rarity ไม่มี Growth bonus)
- รายชื่อ Skills, การจัด Skill เข้าแต่ละ Stat Pool, เงื่อนไขคุณสมบัติของ Skills และรายละเอียดการปลดล็อก/Upgrade
- ผลของ Aptitude, Traits และ Personality ต่อการเติบโตหรือพฤติกรรม
- รายละเอียดและแหล่งที่มาของชื่อที่ Generator สุ่ม
- วิธีคำนวณราคาและขั้นตอนสุ่มนักผจญภัยจากโรงเตี้ยม
- ค่าเริ่มต้น การใช้ และการฟื้นฟู AP
- รายละเอียด Skill, Cooldown และคำสั่งที่ใช้ระหว่างต่อสู้
- ค่าใช้จ่ายและข้อจำกัดของการ Reroll Skill รวมถึงกฎอื่นของ Skill Orbs ที่ยังไม่ได้ระบุ
- วิธีเลือกเป้าหมาย การเคลื่อนที่ และเงื่อนไขจบการต่อสู้
- ระบบบันทึกความคืบหน้าและรายละเอียดการเล่นหลายผู้เล่น
