import { initializeApp } from 'firebase/app';
import { getStorage, ref, listAll, deleteObject } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyAkRQXh5tKRSajUFe9T0ioBz3iF-AAbz6E',
  authDomain: 'orderin-7f8bc.firebaseapp.com',
  projectId: 'orderin-7f8bc',
  storageBucket: 'orderin-7f8bc.firebasestorage.app',
  messagingSenderId: '977042319750',
  appId: '1:977042319750:web:9c904f389a44fa7c69a407',
  measurementId: 'G-GFP5VLL3S4'
};

const shouldDelete = process.argv.includes('--delete');
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

async function collectObjects(folderRef, objects = []) {
  const result = await listAll(folderRef);
  objects.push(...result.items);

  for (const prefixRef of result.prefixes) {
    await collectObjects(prefixRef, objects);
  }

  return objects;
}

const objects = await collectObjects(ref(storage));

if (!objects.length) {
  console.log('No live objects found in Firebase Storage.');
  process.exit(0);
}

console.log(`Found ${objects.length} live object(s):`);
for (const objectRef of objects) {
  console.log(`- ${objectRef.fullPath}`);
}

if (!shouldDelete) {
  console.log('Dry run only. Re-run with --delete to remove these live objects.');
  process.exit(0);
}

for (const objectRef of objects) {
  await deleteObject(objectRef);
  console.log(`Deleted ${objectRef.fullPath}`);
}

console.log(`Deleted ${objects.length} live object(s).`);
