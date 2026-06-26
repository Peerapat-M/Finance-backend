import express, { type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ฟังก์ชันจำลองตัวรับและแปลงสิทธิ์ผู้ใช้จาก Token (Middleware)
const authenticateUser = async (req: Request, res: Response, next: () => void) => {
  const token = req.headers.authorization?.split(' ')[1]; // ดึง Bearer token

  if (!token) {
    return res.status(401).json({ error: 'Missing access token' });
  }

  // สร้าง Supabase client พิเศษเฉพาะ Request นี้เพื่อใช้สิทธิ์ของ User คนนั้นทำงาน
  const userSupabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || '',
    {
      auth: { persistSession: false }, // แนะนำให้ปิดการจำ session ในฝั่ง backend
      global: { headers: { Authorization: `Bearer ${token}` } }
    }
  );

  // 🌟 [จุดแก้ไขที่ 1]: ส่งตัวแปร token เข้าไปด้วยเพื่อให้ตรวจค่าได้ถูกต้อง
  const { data: { user }, error } = await userSupabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // แปะ client และข้อมูล user ลงใน request เพื่อส่งไปใช้ต่อใน API
  (req as any).supabase = userSupabase;
  (req as any).user = user;
  
  // 🌟 [จุดแก้ไขที่ 2]: เติม return ไว้หน้า next()
  return next();
};

// 1. GET - ดึงเฉพาะรายการของผู้ใช้นั้น ๆ
app.get('/api/transactions', authenticateUser, async (req: Request, res: Response) => {
  const client = (req as any).supabase;
  
  const { data, error } = await client
    .from('transactions')
    .select('*')
    .order('date', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 2. POST - เพิ่มรายการใหม่พร้อมระบุ user_id อัตโนมัติ
app.post('/api/transactions', authenticateUser, async (req: Request, res: Response) => {
  const client = (req as any).supabase;
  const user = (req as any).user;
  const { type, description, amount, date } = req.body;
  
  const { data, error } = await client
    .from('transactions')
    .insert([{ 
      type, 
      description, 
      amount, 
      date: date || new Date().toISOString(),
      user_id: user.id // ผูกรหัสผู้ใช้งานเข้ากับแถวข้อมูล
    }])
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data[0]);
});

// 3. DELETE - ลบรายการ (RLS จะป้องกันไม่ให้ลบของคนอื่น)
app.delete('/api/transactions/:id', authenticateUser, async (req: Request, res: Response) => {
  const client = (req as any).supabase;
  const { id } = req.params;
  
  const { error } = await client
    .from('transactions')
    .delete()
    .eq('id', id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Transaction deleted successfully' });
});

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});