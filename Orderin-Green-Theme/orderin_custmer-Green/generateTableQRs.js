const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const numTables = process.argv[2];
const port = process.argv[3] || '5173';

if (!numTables || isNaN(numTables)) {
  console.error('Usage: node generateTableQRs.js <number_of_tables> [port]');
  console.error('If port is not provided, defaults to 5173');
  process.exit(1);
}

const baseURL = `http://localhost:${port}/`;
const qrFolder = path.join(__dirname, 'qrcodes');

// Create qrcodes folder if it doesn't exist
if (!fs.existsSync(qrFolder)) {
  fs.mkdirSync(qrFolder);
}

const urls = [];

for (let i = 1; i <= parseInt(numTables); i++) {
  const url = `${baseURL}?table=${i}`;
  urls.push(url);

  QRCode.toFile(path.join(qrFolder, `table-${i}.png`), url, {
    color: {
      dark: '#000000',  // Black dots
      light: '#FFFFFF' // White background
    }
  }, (err) => {
    if (err) throw err;
    console.log(`QR code for table ${i} generated.`);
  });
}

// Write URLs to urls.txt
fs.writeFileSync('urls.txt', urls.join('\n'));

console.log(`Generated ${numTables} QR codes in /qrcodes folder.`);
console.log('URLs saved to urls.txt.');
