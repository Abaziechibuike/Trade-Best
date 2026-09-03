require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabase = configured ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5 } });

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(session({ name: 'tradebest.sid', secret: process.env.SESSION_SECRET || 'replace-this-before-production', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 604800000 } }));
app.use('/api', rateLimit({ windowMs: 900000, max: 200, standardHeaders: true, legacyHeaders: false }));

const text = (v, max) => String(v || '').trim().slice(0, max);
const price = v => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 100000000 ? n : null; };
const database = (req, res, next) => configured ? next() : res.status(503).json({ ok: false, message: 'Database is not configured. Add Supabase environment variables.' });
const seller = (req, res, next) => req.session.user?.role === 'seller' ? next() : res.status(401).json({ ok: false, message: 'Please sign in as a seller.' });

app.get('/health', (req, res) => res.json({ ok: true, databaseConfigured: configured }));
app.get('/api/auth/me', (req, res) => res.json({ ok: true, user: req.session.user || null }));
app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.post('/api/buyer/signup', database, async (req,res) => { const fullName=text(req.body.fullName,120), email=text(req.body.email,160).toLowerCase(), password=String(req.body.password||''); if(!fullName||!email||password.length<8)return res.status(400).json({ok:false,message:'Enter your name, email, and an 8+ character password.'}); const {data,error}=await supabase.auth.admin.createUser({email,password,email_confirm:true}); if(error)return res.status(400).json({ok:false,message:error.message}); const {error:profileError}=await supabase.from('profiles').insert({id:data.user.id,role:'buyer',full_name:fullName}); if(profileError){await supabase.auth.admin.deleteUser(data.user.id);return res.status(500).json({ok:false,message:'Could not create buyer account.'})} req.session.user={id:data.user.id,role:'buyer',fullName};res.status(201).json({ok:true,user:req.session.user}); });
app.post('/api/buyer/login', database, async (req,res) => { const {data,error}=await supabase.auth.signInWithPassword({email:text(req.body.email,160).toLowerCase(),password:String(req.body.password||'')}); if(error||!data.user)return res.status(401).json({ok:false,message:'Invalid email or password.'}); const {data:profile}=await supabase.from('profiles').select('role,full_name').eq('id',data.user.id).maybeSingle(); if(!profile||profile.role!=='buyer')return res.status(403).json({ok:false,message:'This is not a buyer account.'}); req.session.user={id:data.user.id,role:'buyer',fullName:profile.full_name};res.json({ok:true,user:req.session.user}); });
app.post('/api/buyer/password-reset', database, async (req,res) => { const email=text(req.body.email,160).toLowerCase(); if(!email)return res.status(400).json({ok:false,message:'Email is required.'}); await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${process.env.BASE_URL || `http://localhost:${PORT}`}/buyer-login.html`}); res.json({ok:true,message:'If an account exists, reset instructions have been sent.'}); });
app.post('/api/seller/password-reset', database, async (req,res) => { const email=text(req.body.email,160).toLowerCase(); if(!email)return res.status(400).json({ok:false,message:'Email is required.'}); await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${process.env.BASE_URL || `http://localhost:${PORT}`}/seller-login.html`}); res.json({ok:true,message:'If an account exists, reset instructions have been sent.'}); });
app.post('/api/auth/signup', database, async (req, res) => {
  const businessName = text(req.body.businessName, 100), ownerName = text(req.body.ownerName, 100), city = text(req.body.city, 80), email = text(req.body.email, 160).toLowerCase(), password = String(req.body.password || '');
  if (!businessName || !ownerName || !email || password.length < 8) return res.status(400).json({ ok: false, message: 'Provide business and owner names, a valid email, and an 8+ character password.' });
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return res.status(400).json({ ok: false, message: error.message });
  const { error: userProfileError } = await supabase.from('profiles').insert({ id: data.user.id, role: 'seller', full_name: ownerName });
  if (userProfileError) { await supabase.auth.admin.deleteUser(data.user.id); return res.status(500).json({ ok: false, message: 'Could not create user profile.' }); }
  const { error: profileError } = await supabase.from('seller_profiles').insert({ id: data.user.id, business_name: businessName, owner_name: ownerName, city, status: 'active' });
  if (profileError) { await supabase.auth.admin.deleteUser(data.user.id); return res.status(500).json({ ok: false, message: 'Could not create seller profile.' }); }
  req.session.user = { id: data.user.id, role: 'seller', businessName }; res.status(201).json({ ok: true, user: req.session.user });
});
app.post('/api/auth/login', database, async (req, res) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email: text(req.body.email, 160).toLowerCase(), password: String(req.body.password || '') });
  if (error || !data.user) return res.status(401).json({ ok: false, message: 'Invalid email or password.' });
  const { data: profile } = await supabase.from('seller_profiles').select('business_name').eq('id', data.user.id).maybeSingle();
  if (!profile) return res.status(403).json({ ok: false, message: 'This is not a seller account.' });
  req.session.user = { id: data.user.id, role: 'seller', businessName: profile.business_name }; res.json({ ok: true, user: req.session.user });
});

app.get('/api/products', database, async (req, res) => {
  const q = text(req.query.q, 80), category = text(req.query.category, 60);
  let query = supabase.from('products').select('id,title,description,price,category,image_urls,stock,created_at,seller_profiles(business_name,city)').eq('status', 'published').order('created_at', { ascending: false });
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`); if (category) query = query.eq('category', category);
  const { data, error } = await query; if (error) return res.status(500).json({ ok: false, message: 'Could not load products.' }); res.json(data || []);
});
app.get('/api/products/categories', database, async (req, res) => { const { data, error } = await supabase.from('products').select('category').eq('status', 'published'); if (error) return res.status(500).json({ ok: false, message: 'Could not load categories.' }); res.json([...new Set(data.map(x => x.category).filter(Boolean))].sort()); });
app.get('/api/seller/products', seller, async (req, res) => { const { data, error } = await supabase.from('products').select('*').eq('seller_id', req.session.user.id).order('created_at', { ascending: false }); if (error) return res.status(500).json({ ok: false, message: 'Could not load your products.' }); res.json(data || []); });
async function images(files) { const urls = []; for (const file of files || []) { if (!file.mimetype.startsWith('image/')) throw Error('Only image files are allowed.'); const name = `${crypto.randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-')}`; const { error } = await supabase.storage.from('product-images').upload(name, file.buffer, { contentType: file.mimetype }); if (error) throw Error('Image upload failed.'); urls.push(supabase.storage.from('product-images').getPublicUrl(name).data.publicUrl); } return urls; }
app.post('/api/products', seller, upload.array('image', 5), async (req, res) => { try { const title = text(req.body.title, 140), description = text(req.body.description, 3000), category = text(req.body.category, 60), amount = price(req.body.price), stock = Math.max(0, parseInt(req.body.stock, 10) || 0); if (!title || !description || !category || !amount) return res.status(400).json({ ok: false, message: 'Title, description, category, and a positive price are required.' }); const { data, error } = await supabase.from('products').insert({ seller_id: req.session.user.id, title, description, category, price: amount, stock, image_urls: await images(req.files), status: 'published' }).select().single(); if (error) throw error; res.status(201).json({ ok: true, product: data }); } catch (e) { res.status(400).json({ ok: false, message: e.message || 'Could not create product.' }); } });
app.put('/api/products/:id', seller, upload.array('image', 5), async (req, res) => { try { const updates = {}; [['title', 140], ['description', 3000], ['category', 60]].forEach(([key,max]) => { if (req.body[key] !== undefined) updates[key] = text(req.body[key], max); }); if (req.body.price !== undefined) { const amount = price(req.body.price); if (!amount) return res.status(400).json({ ok: false, message: 'Price must be positive.' }); updates.price = amount; } if (req.body.stock !== undefined) updates.stock = Math.max(0, parseInt(req.body.stock, 10) || 0); const fileUrls = await images(req.files); if (fileUrls.length) updates.image_urls = fileUrls; const { data, error } = await supabase.from('products').update(updates).eq('id', req.params.id).eq('seller_id', req.session.user.id).select().maybeSingle(); if (error || !data) return res.status(404).json({ ok: false, message: 'Product not found.' }); res.json({ ok: true, product: data }); } catch (e) { res.status(400).json({ ok: false, message: e.message || 'Could not update product.' }); } });
app.delete('/api/products/:id', seller, async (req, res) => { const { error } = await supabase.from('products').delete().eq('id', req.params.id).eq('seller_id', req.session.user.id); if (error) return res.status(500).json({ ok: false, message: 'Could not delete product.' }); res.json({ ok: true }); });
app.post('/api/orders', database, async (req, res) => { const email=text(req.body.email,160).toLowerCase(), name=text(req.body.name,120), phone=text(req.body.phone,30), address=text(req.body.address,500), deliveryMode=req.body.deliveryMode==='logistics'?'logistics':'manual', cart=Array.isArray(req.body.items)?req.body.items:[]; if(!email||!name||!phone||!address||!cart.length)return res.status(400).json({ok:false,message:'Complete delivery and cart details.'}); const ids=cart.map(x=>x.productId); const {data:products,error}=await supabase.from('products').select('id,title,price,stock,seller_id').in('id',ids).eq('status','published'); if(error||products.length!==ids.length)return res.status(400).json({ok:false,message:'One or more products are unavailable.'}); let total=0;const items=[];for(const line of cart){const p=products.find(x=>x.id===line.productId),quantity=Math.max(1,Math.min(20,parseInt(line.quantity,10)||1));if(!p||p.stock<quantity)return res.status(400).json({ok:false,message:`${p?.title||'A product'} is out of stock.`});total+=Number(p.price)*quantity;items.push({product_id:p.id,seller_id:p.seller_id,title:p.title,unit_price:p.price,quantity});}const {data:order,error:orderError}=await supabase.from('orders').insert({customer_email:email,customer_name:name,customer_phone:phone,delivery_address:address,delivery_mode:deliveryMode,total_amount:total,status:'pending_payment'}).select().single();if(orderError)return res.status(500).json({ok:false,message:'Could not create order.'});const {error:itemsError}=await supabase.from('order_items').insert(items.map(x=>({...x,order_id:order.id})));if(itemsError)return res.status(500).json({ok:false,message:'Could not create order items.'});res.status(201).json({ok:true,orderId:order.id,total}); });

async function notifyOrder(order, subject, message) {
  const work = [];
  if (process.env.RESEND_API_KEY && process.env.NOTIFICATION_FROM) work.push(fetch('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:`Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json' }, body:JSON.stringify({ from:process.env.NOTIFICATION_FROM, to:[order.customer_email], subject, html:`<p>${message}</p>` }) }));
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) work.push(fetch(`https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { method:'POST', headers:{ Authorization:`Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type':'application/json' }, body:JSON.stringify({ messaging_product:'whatsapp', to:order.customer_phone.replace(/[^0-9]/g,''), type:'text', text:{ body:message } }) }));
  await Promise.allSettled(work);
}
function providerConfig(provider) {
  if (provider === 'paystack' && process.env.PAYSTACK_SECRET_KEY) return { provider, secret:process.env.PAYSTACK_SECRET_KEY };
  if (provider === 'flutterwave' && process.env.FLUTTERWAVE_SECRET_KEY) return { provider, secret:process.env.FLUTTERWAVE_SECRET_KEY };
  return null;
}
app.post('/api/orders/:id/pay', database, async (req,res) => {
  const provider = text(req.body.provider, 20).toLowerCase(), config = providerConfig(provider);
  if (!config) return res.status(503).json({ ok:false, message:'Selected payment provider is not configured.' });
  const { data:order, error } = await supabase.from('orders').select('*').eq('id',req.params.id).eq('status','pending_payment').maybeSingle();
  if (error || !order) return res.status(404).json({ ok:false, message:'Unpaid order not found.' });
  const reference = `TB-${order.order_number || order.id.slice(0,8)}-${Date.now()}`;
  const base = process.env.BASE_URL || `http://localhost:${PORT}`;
  let response, checkoutUrl;
  if (provider === 'paystack') {
    response = await fetch('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:`Bearer ${config.secret}`,'Content-Type':'application/json'},body:JSON.stringify({email:order.customer_email,amount:Math.round(Number(order.total_amount)*100),currency:'NGN',reference,callback_url:`${base}/payment/callback?provider=paystack`,metadata:{orderId:order.id}})}).then(r=>r.json());
    checkoutUrl = response?.data?.authorization_url;
  } else {
    response = await fetch('https://api.flutterwave.com/v3/payments',{method:'POST',headers:{Authorization:`Bearer ${config.secret}`,'Content-Type':'application/json'},body:JSON.stringify({tx_ref:reference,amount:String(order.total_amount),currency:'NGN',redirect_url:`${base}/payment/callback?provider=flutterwave`,customer:{email:order.customer_email,name:order.customer_name,phonenumber:order.customer_phone},meta:{orderId:order.id}})}).then(r=>r.json());
    checkoutUrl = response?.data?.link;
  }
  if (!checkoutUrl) return res.status(502).json({ok:false,message:'Payment provider did not return a checkout link.'});
  await supabase.from('orders').update({payment_status:'pending',payment_reference:reference}).eq('id',order.id);
  await supabase.from('payments').insert({order_id:order.id,provider,reference,amount:order.total_amount,status:'initialized'});
  res.json({ok:true,checkoutUrl,reference});
});
async function markPaid(reference, provider, amount) {
  const { data:order } = await supabase.from('orders').select('*').eq('payment_reference',reference).maybeSingle();
  if (!order || Number(order.total_amount) !== Number(amount)) return false;
  await supabase.from('orders').update({status:'paid',payment_status:'paid',paid_at:new Date().toISOString()}).eq('id',order.id);
  await supabase.from('payments').update({status:'successful',verified_at:new Date().toISOString()}).eq('reference',reference).eq('provider',provider);
  await notifyOrder(order, `Order #${order.order_number} confirmed`, `Your Trade Best order #${order.order_number} has been paid and is awaiting seller confirmation.`);
  return true;
}
app.post('/api/webhooks/paystack', express.json(), async (req,res) => { const signature=req.headers['x-paystack-signature']; const hash=crypto.createHmac('sha512',process.env.PAYSTACK_SECRET_KEY || '').update(JSON.stringify(req.body)).digest('hex'); if (!signature || signature !== hash) return res.sendStatus(401); if(req.body.event==='charge.success') await markPaid(req.body.data.reference,'paystack',Number(req.body.data.amount)/100); res.sendStatus(200); });
app.post('/api/webhooks/flutterwave', express.json(), async (req,res) => { if (!process.env.FLUTTERWAVE_WEBHOOK_HASH || req.headers['verif-hash'] !== process.env.FLUTTERWAVE_WEBHOOK_HASH) return res.sendStatus(401); const event=req.body?.data; if(event?.status==='successful') await markPaid(event.tx_ref,'flutterwave',event.amount); res.sendStatus(200); });
app.get('/payment/callback',(req,res)=>res.send('<main style="font-family:Arial;max-width:560px;margin:80px auto"><h1>Payment received</h1><p>We are confirming your payment. You will receive your order update by email or WhatsApp.</p><a href="/catalog.html">Continue shopping</a></main>'));
['index.html','catalog.html','product.html','buyer-login.html','buyer-dashboard.html','seller-signup.html','seller-login.html','seller-dashboard.html','styles.css'].forEach(file => app.get('/'+file,(req,res)=>res.sendFile(path.join(__dirname,file))));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.use('/assets',express.static(path.join(__dirname,'assets'),{index:false,dotfiles:'deny'}));
app.use((req,res)=>res.status(404).json({ok:false,message:'Not found.'}));
app.use((err,req,res,next)=>{if(err instanceof multer.MulterError)return res.status(400).json({ok:false,message:'Image upload is too large or invalid.'});console.error(err);res.status(500).json({ok:false,message:'Unexpected server error.'});});
app.listen(PORT,()=>console.log(`Trade Best running at http://localhost:${PORT}`));
