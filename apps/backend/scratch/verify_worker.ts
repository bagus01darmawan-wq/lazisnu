// Test script to verify BullMQ + ioredis-mock works in a single process
import { addWhatsAppJob } from '../src/services/queues';
import '../src/workers/whatsapp.worker'; // This starts the worker in this process

async function testWorker() {
  console.log('--- Starting Integrated Queue Test ---');
  
  const testData = {
    phone: '08123456789',
    ownerName: 'Integrated Test Owner',
    nominal: BigInt(35000),
    officerName: 'Verification Script',
    collectionId: 'f0000000-0000-0000-0000-000000000002',
    isResubmit: false
  };

  console.log('Adding job to queue...');
  const job = await addWhatsAppJob(testData);
  console.log(`Job added! ID: ${job.id}`);

  console.log('Waiting for worker to process... (Rate limit: 2/sec)');
  
  // The worker should log "Processing WhatsApp to..." automatically
  await new Promise(r => setTimeout(r, 4000));
  
  console.log('--- Integrated Test Finished ---');
  process.exit(0);
}

testWorker().catch(console.error);
