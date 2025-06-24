const express = require('express');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// Stripe requires raw body for signature verification
app.use(express.raw({ type: 'application/json' }));

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ Handle successful payment
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_email;

    const { error } = await supabase
      .from('users')
      .update({
        is_premium: true,
        storage_limit: 5 * 1024 * 1024 * 1024, // 5 GB
      })
      .eq('email', email);

    if (error) {
      console.error('❌ Supabase update error:', error);
    } else {
      console.log(`✅ User ${email} upgraded to premium.`);
    }
  }

  res.status(200).send('✅ Received');
});

app.get('/', (req, res) => res.send('🚀 Webhook server running.'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
