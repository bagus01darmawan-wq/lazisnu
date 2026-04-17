import { sendWhatsAppNotification } from './src/services/whatsapp';

async function testQueue() {
  console.log('--- Starting Queue Test ---');
  
  const testData = {
    phone: '08123456789',
    ownerName: 'Test Owner',
    nominal: BigInt(25000),
    officerName: 'Ahmad Petugas',
    options: {
      collectionId: 'f0000000-0000-0000-0000-000000000001',
      collectedAt: new Date().toISOString()
    }
  };

  console.log('Adding job to queue...');
  const job = await sendWhatsAppNotification(
    testData.phone,
    testData.ownerName,
    testData.nominal,
    testData.officerName,
    testData.options
  );

  console.log(`Job added! ID: ${job.id}`);
  console.log('Wait for worker to process...');
  
  // Wait a bit for the worker in the other process (or this one if we import worker here)
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('--- Test Finished ---');
  process.exit(0);
}

testQueue().catch(console.error);
