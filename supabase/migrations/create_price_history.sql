create table price_history (
  id bigint primary key generated always as identity,
  spot_pair text not null,
  price numeric not null,
  market_type text not null,
  exchange text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create an index for faster queries
create index idx_price_history_spot_pair on price_history(spot_pair);
create index idx_price_history_created_at on price_history(created_at); 