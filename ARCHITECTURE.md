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
