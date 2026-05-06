import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { mentors } from './mentors.js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const mockCampuses = [
  {
    name: 'University of Oxford',
    slug: 'oxford',
    vibe: 'Historic, collegiate, and steeped in tradition.',
    insider_hooks: ['College system', 'Tutorials', 'The Bodleian'],
    location: 'Oxford, UK'
  },
  {
    name: 'London School of Economics',
    slug: 'lse',
    vibe: 'Urban, ambitious, and globally focused.',
    insider_hooks: ['Holborn networking', 'Public lectures', 'Career focus'],
    location: 'London, UK'
  },
  {
    name: 'HEC Paris',
    slug: 'hec-paris',
    vibe: 'Elite, entrepreneurial, and deeply networked.',
    insider_hooks: ['Jouy-en-Josas campus', 'Grandes Écoles network', 'Finance & Luxury focus'],
    location: 'Paris, France'
  },
  {
    name: 'Sciences Po',
    slug: 'sciences-po',
    vibe: 'Political, intellectual, and international.',
    insider_hooks: ['27 Rue Saint-Guillaume', 'Public service focus', 'International affairs'],
    location: 'Paris, France'
  },
  {
    name: 'University of Cambridge',
    slug: 'cambridge',
    vibe: 'Excellence, innovation, and ancient beauty.',
    insider_hooks: ['Tripos system', 'Silicon Fen', 'May Balls'],
    location: 'Cambridge, UK'
  }
];

async function seed() {
  console.log('Seeding campuses...');

  for (const campus of mockCampuses) {
    const { data: existing } = await supabase
      .from('campuses')
      .select('id')
      .eq('slug', campus.slug)
      .maybeSingle();

    if (!existing) {
      const { data: newCampus, error } = await supabase
        .from('campuses')
        .insert(campus)
        .select('id')
        .single();
      
      if (error) {
        console.error(`Error inserting ${campus.name}:`, error);
      } else {
        console.log(`Seeded ${campus.name}`);
        campus.id = newCampus.id;
      }
    } else {
      campus.id = existing.id;
      console.log(`${campus.name} already exists`);
    }
  }

  console.log('Linking mentors to campuses...');
  const { data: people } = await supabase.from('people').select('id, background');
  
  if (people) {
    for (const person of people) {
      const matchedCampus = mockCampuses.find(c => 
        person.background?.toLowerCase().includes(c.name.toLowerCase()) || 
        person.background?.toLowerCase().includes(c.slug.replace('-', ' '))
      );

      if (matchedCampus) {
        await supabase
          .from('people')
          .update({ campus_id: matchedCampus.id })
          .eq('id', person.id);
        console.log(`Linked ${person.id} to ${matchedCampus.name}`);
      }
    }
  }

  console.log('Seeding complete!');
}

seed().catch(console.error);
