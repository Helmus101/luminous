import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { mentors } from './mentors.js';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log(`Seeding ${mentors.length} mentors...`);
  for (const m of mentors) {
    const { error } = await supabase.from('people').upsert({
      external_key: m.id,
      name: m.name,
      background: m.background,
      current_role_text: m.currentRole,
      expertise: m.expertise,
      interests: m.interests,
      goals: m.goals,
      relationship_preferences: m.relationshipPreferences,
      location: m.location,
      industries: m.industries,
      contact_email: m.contact,
      linkedin_url: m.linkedinUrl,
      willing_to_connect: true
    }, { onConflict: 'external_key' });
    
    if (error) {
        console.error(`Error seeding ${m.name}:`, error.message);
    }
  }
  console.log('Seeding complete.');
}

seed();
