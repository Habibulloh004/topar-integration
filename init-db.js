// MongoDB initialization script
// Runs automatically on first container start when /data/db is empty

db = db.getSiblingDB('topar_db');

// Create collections
db.createCollection('products');
db.createCollection('sync_logs');

// Create indexes for products collection
db.products.createIndex({ sku_id: 1 }, { unique: true });
db.products.createIndex({ barcode_uzum: 1 });
db.products.createIndex({ barcode_billz: 1 });
db.products.createIndex({ product_title: 'text' });
db.products.createIndex({ updated_at: -1 });
db.products.createIndex({ amount: 1 });
db.products.createIndex({ sku_title: 'text' });
db.products.createIndex({ product_id: 1 });

// Create indexes for sync_logs collection
db.sync_logs.createIndex({ created_at: -1 });
db.sync_logs.createIndex({ status: 1 });
db.sync_logs.createIndex({ source: 1 });

// Insert sample data
db.products.insertMany([
  {
    sku_id: 19641,
    barcode_uzum: '9785699906567',
    barcode_billz: '123123123',
    product_title: 'Graviti Folz, Kundalik 3',
    amount: 0,
    price: 382000,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    sku_id: 19642,
    barcode_uzum: '9785699906568',
    barcode_billz: '123123124',
    product_title: 'Sample Product 2',
    amount: 5,
    price: 250000,
    created_at: new Date(),
    updated_at: new Date()
  }
]);

print('✓ MongoDB initialized successfully');
print('✓ Collections created: products, sync_logs');
print('✓ Indexes created');
print('✓ Sample data inserted');
