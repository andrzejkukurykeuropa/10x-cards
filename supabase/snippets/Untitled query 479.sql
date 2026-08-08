UPDATE auth.users
SET last_sign_in_at = now() - interval '23 months 15 days'
WHERE email = 'andrzejkukuryk@gmail.com';