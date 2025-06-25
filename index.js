const express = require('express');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// Stripe requires raw body to verify signatures
app.use(express.raw({ type: 'application/json' }));

// Initialize Stripe and Supabase clients
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Webhook endpoint
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
    console.error('❌ Stripe webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      // Retrieve full customer to get the email
      const customer = await stripe.customers.retrieve(session.customer);
      const email = customer.email;

      console.log("✅ Stripe customer email:", email);

      // Update the user in Supabase
      const { data, error } = await supabase
        .from('users')
        .update({
          is_premium: true,
          storage_limit: 5 * 1024 * 1024 * 1024, // 5 GB
        })
        .eq('email', email)
        .single();

      if (error) {
        console.error('❌ Supabase update error:', error.message);
      } else if (!data) {
        console.warn('⚠️ No user found with that email.');
      } else {
        console.log(`✅ User ${email} upgraded to premium.`);
      }

    } catch (err) {
      console.error('❌ Failed to retrieve customer or update Supabase:', err.message);
    }
  }

  res.status(200).send('✅ Received');
});

// Health check
app.get('/', (req, res) => res.send('🚀 Webhook server running.'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));


app.use(express.json()); // add this before your routes

app.post('/create-checkout-session', async (req, res) => {
  const { email } = req.body;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: email, // ✅ THIS IS WHAT THE WEBHOOK NEEDS
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Premium Plan',
        },
        unit_amount: 999,
      },
      quantity: 1,
    }],
    success_url: 'https://your-site.com/success',
    cancel_url: 'https://your-site.com/cancel',
  });

  res.json({ url: session.url });
});

