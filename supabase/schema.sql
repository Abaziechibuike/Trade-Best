-- Trade Best marketplace schema. Run in Supabase SQL Editor before deployment.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'buyer' check (role in ('buyer','seller','admin')),
  full_name text, phone text, created_at timestamptz not null default now()
);
create table if not exists public.seller_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  business_name text not null, owner_name text not null, city text,
  status text not null default 'pending' check(status in ('pending','active','suspended')),
  created_at timestamptz not null default now()
);
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Home', recipient_name text not null, phone text not null, line1 text not null, line2 text,
  city text not null, state text not null, is_default boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.categories (id uuid primary key default gen_random_uuid(), name text not null unique, slug text not null unique, image_url text, is_active boolean not null default true);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.seller_profiles(id) on delete restrict,
  category_id uuid references public.categories(id), title text not null, description text not null, category text not null,
  price numeric(12,2) not null check(price>0), compare_at_price numeric(12,2), stock integer not null default 0 check(stock>=0), reserved_stock integer not null default 0 check(reserved_stock>=0),
  image_urls text[] not null default '{}', status text not null default 'draft' check(status in ('draft','published','archived')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists products_catalog_idx on public.products(status, category, created_at desc);
create index if not exists products_seller_idx on public.products(seller_id, created_at desc);
create table if not exists public.carts (id uuid primary key default gen_random_uuid(), user_id uuid unique references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.cart_items (id uuid primary key default gen_random_uuid(), cart_id uuid not null references public.carts(id) on delete cascade, product_id uuid not null references public.products(id) on delete cascade, quantity integer not null check(quantity>0), unique(cart_id,product_id));
create table if not exists public.wishlists (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, product_id uuid not null references public.products(id) on delete cascade, created_at timestamptz not null default now(), unique(user_id,product_id));
create table if not exists public.recently_viewed (user_id uuid not null references public.profiles(id) on delete cascade, product_id uuid not null references public.products(id) on delete cascade, viewed_at timestamptz not null default now(), primary key(user_id,product_id));
create table if not exists public.coupons (code text primary key, discount_type text not null check(discount_type in ('percent','fixed')), value numeric(12,2) not null check(value>0), minimum_amount numeric(12,2) not null default 0, active boolean not null default true, expires_at timestamptz);
create type order_status as enum ('pending_payment','paid','confirmed','packed','shipped','delivered','cancelled','refunded');
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), order_number bigint generated always as identity unique,
  buyer_id uuid references public.profiles(id), customer_email text not null, customer_name text not null, customer_phone text not null, delivery_address text not null,
  total_amount numeric(12,2) not null check(total_amount>0), delivery_fee numeric(12,2) not null default 0, delivery_mode text not null default 'manual' check(delivery_mode in ('manual','logistics')), status order_status not null default 'pending_payment',
  payment_status text not null default 'unpaid' check(payment_status in ('unpaid','pending','paid','failed','refunded')),
  payment_reference text unique, created_at timestamptz not null default now(), paid_at timestamptz
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id), seller_id uuid not null references public.seller_profiles(id), title text not null,
  unit_price numeric(12,2) not null, quantity integer not null check(quantity>0), fulfilment_status text not null default 'pending'
);
create index if not exists order_items_seller_idx on public.order_items(seller_id, fulfilment_status);
create table if not exists public.payments (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, provider text not null, reference text not null unique, amount numeric(12,2) not null, status text not null default 'initialized', provider_payload jsonb, created_at timestamptz not null default now(), verified_at timestamptz);
create table if not exists public.shipments (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, provider text, tracking_number text, status text not null default 'pending', delivery_fee numeric(12,2), events jsonb not null default '[]', created_at timestamptz not null default now());
create table if not exists public.reviews (id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade, buyer_id uuid not null references public.profiles(id) on delete cascade, rating integer not null check(rating between 1 and 5), body text, status text not null default 'pending', created_at timestamptz not null default now(), unique(product_id,buyer_id));
create table if not exists public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, type text not null, title text not null, body text not null, read_at timestamptz, created_at timestamptz not null default now());
create table if not exists public.support_tickets (id uuid primary key default gen_random_uuid(), buyer_id uuid references public.profiles(id) on delete set null, order_id uuid references public.orders(id) on delete set null, subject text not null, body text not null, status text not null default 'open' check(status in ('open','in_progress','resolved','closed')), created_at timestamptz not null default now());
create table if not exists public.return_requests (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, buyer_id uuid not null references public.profiles(id), reason text not null, status text not null default 'requested' check(status in ('requested','approved','rejected','received','refunded')), created_at timestamptz not null default now());
alter table public.profiles enable row level security; alter table public.seller_profiles enable row level security; alter table public.addresses enable row level security; alter table public.products enable row level security; alter table public.orders enable row level security; alter table public.order_items enable row level security;
create policy "published products public" on public.products for select using(status='published');
-- Create a public Storage bucket named product-images. The app's server key writes to it; never expose that key in the browser.
