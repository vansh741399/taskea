/**
 * Seed OfficeLocation table with the 3 Laxree offices.
 * Run: node /home/z/my-project/scripts/seed-offices.js
 */
const { PrismaClient } = require('@prisma/client');

// Set DATABASE_URL from .env
require('dotenv').config({ path: '/home/z/my-project/.env' });

const db = new PrismaClient();

const OFFICES = [
  {
    name: 'Ajmer Office',
    address: 'Plot No. 1 & 2, Harbilas Sharda Marg, Civil Lines, Ajmer, Rajasthan 305001',
    city: 'Ajmer',
    // Civil Lines, Ajmer — Harbilas Sharda Marg is the main road through Civil Lines
    latitude: 26.4745,
    longitude: 74.6389,
    radiusMeters: 100,
  },
  {
    name: 'Jaipur Office',
    address: 'Samarth International, Plot No. 8, 1st floor, Opp. Metro Pillar No. 30, Rani Sati Nagar, Gopalpura Bypas Road, Mansarovar, Jaipur. 302019',
    city: 'Jaipur',
    // Mansarovar, Gopalpura Bypass area, Jaipur
    latitude: 26.8465,
    longitude: 75.7625,
    radiusMeters: 100,
  },
  {
    name: 'Gurugram Office',
    address: 'Plot No. 232, Sector-18, Phase - 4, Udyog Vihar, Gurugram, Haryana - 122016',
    city: 'Gurugram',
    // Udyog Vihar Phase 4, Sector 18, Gurugram
    latitude: 28.4989,
    longitude: 77.0789,
    radiusMeters: 100,
  },
];

async function main() {
  console.log('Seeding office locations...\n');

  for (const office of OFFICES) {
    const existing = await db.officeLocation.findUnique({
      where: { name: office.name },
    });

    if (existing) {
      const updated = await db.officeLocation.update({
        where: { name: office.name },
        data: office,
      });
      console.log(`✅ Updated: ${updated.name} (${updated.city})`);
      console.log(`   Lat: ${updated.latitude}, Lng: ${updated.longitude}, Radius: ${updated.radiusMeters}m`);
    } else {
      const created = await db.officeLocation.create({ data: office });
      console.log(`✅ Created: ${created.name} (${created.city})`);
      console.log(`   Lat: ${created.latitude}, Lng: ${created.longitude}, Radius: ${created.radiusMeters}m`);
    }
  }

  // Auto-assign users to offices based on their location field
  console.log('\n--- Auto-assigning users to offices ---');
  const users = await db.user.findMany({ select: { id: true, name: true, location: true } });

  for (const user of users) {
    if (!user.location) {
      console.log(`  ⏭️  ${user.name}: no location set, skipping`);
      continue;
    }

    const loc = user.location.toLowerCase();
    let officeName = null;
    if (loc.includes('ajmer')) officeName = 'Ajmer Office';
    else if (loc.includes('jaipur') || loc.includes('mansarovar')) officeName = 'Jaipur Office';
    else if (loc.includes('gurugram') || loc.includes('gurgaon') || loc.includes('udyog')) officeName = 'Gurugram Office';

    if (officeName) {
      const office = await db.officeLocation.findUnique({ where: { name: officeName } });
      if (office) {
        await db.user.update({
          where: { id: user.id },
          data: { officeId: office.id },
        });
        console.log(`  ✅ ${user.name}: assigned to ${officeName} (location: "${user.location}")`);
      }
    } else {
      console.log(`  ⏭️  ${user.name}: location "${user.location}" doesn't match any office`);
    }
  }

  console.log('\n✅ Done!');
  console.log('\nOffices in DB:');
  const allOffices = await db.officeLocation.findMany({ include: { _count: { select: { users: true } } } });
  for (const o of allOffices) {
    console.log(`  - ${o.name} (${o.city}) — ${o._count.users} users assigned`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
