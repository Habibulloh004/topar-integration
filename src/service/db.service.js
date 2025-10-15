import { MongoClient, ObjectId } from 'mongodb';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

// MongoDB connection URI
// const MONGODB_URI = process.env.MONGODB_URI || 
//   `mongodb://${process.env.MONGODB_USER || 'topar_admin'}:${process.env.MONGODB_PASSWORD || 'topar_password_2024'}@${process.env.MONGODB_HOST || 'localhost'}:${process.env.MONGODB_PORT || 27017}/${process.env.MONGODB_DATABASE || 'topar_db'}?authSource=admin`;

const MONGODB_URI =
  process.env.MONGODB_URI ||
  `mongodb://${process.env.MONGODB_USER || 'topar_admin'}:${
    process.env.MONGODB_PASSWORD || 'topar_password_2024'
  }@${process.env.MONGODB_HOST || 'localhost'}:${
    process.env.MONGODB_PORT || 27017
  }/${process.env.MONGODB_DATABASE || 'topar_db'}?authSource=admin`;

const DATABASE_NAME = process.env.MONGODB_DATABASE || 'topar_db';

let client;
let db;

/**
 * Connect to MongoDB
 */
export async function connect() {
  if (db && client?.topology?.isConnected()) return db;

  try {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 20,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db(DATABASE_NAME);

    // ⚙️ Check if DB exists or create a dummy collection to initialize it
    const admin = client.db().admin();
    const databases = await admin.listDatabases();
    const exists = databases.databases.some((d) => d.name === DATABASE_NAME);

    if (!exists) {
      console.log(`⚠️ Database "${DATABASE_NAME}" not found — creating...`);
      await db.createCollection('init_collection');
      await db.collection('init_collection').insertOne({
        message: 'Initial collection created automatically',
        created_at: new Date(),
      });
      console.log(`✅ Database "${DATABASE_NAME}" created successfully`);
    } else {
      console.log(`✓ Connected to existing database "${DATABASE_NAME}"`);
    }

    return db;
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    throw error;
  }
}

/**
 * Get database instance
 */
export async function getDB() {
  if (!db) {
    await connect();
  }
  return db;
}

/**
 * Close MongoDB connection
 */
export async function closeConnection() {
  if (client) {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

// ============= Sync Logs =============

/**
 * Create a new sync log entry
 */
export async function createSyncLog(syncType, source, status = 'started') {
  const database = await getDB();
  const syncLog = {
    sync_type: syncType,
    source,
    status,
    items_processed: 0,
    items_failed: 0,
    error_message: null,
    started_at: new Date(),
    completed_at: null,
    created_at: new Date(),
  };

  const result = await database.collection('sync_logs').insertOne(syncLog);
  return { ...syncLog, _id: result.insertedId };
}

/**
 * Update sync log when completed
 */
export async function updateSyncLog(id, data) {
  const database = await getDB();
  const updateData = { ...data, completed_at: new Date() };

  const result = await database.collection('sync_logs').findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: updateData },
    { returnDocument: 'after' }
  );

  return result;
}

/**
 * Get recent sync logs
 */
export async function getRecentSyncLogs(limit = 50) {
  const database = await getDB();
  const logs = await database.collection('sync_logs')
    .find({})
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();

  return logs;
}

// ============= Products =============

/**
 * Upsert a product
 * @param {Object} productData - { skuId, barcode_uzum, barcode_billz, productTitle, amount, price }
 */
export async function upsertProduct(productData) {
  const database = await getDB();
  
  const product = {
    sku_id: productData.skuId,
    barcode_uzum: productData.barcode_uzum || null,
    barcode_billz: productData.barcode_billz || null,
    product_title: productData.productTitle || null,
    amount: productData.amount || 0,
    price: productData.price || 0,
    updated_at: new Date(),
  };

  const result = await database.collection('products').findOneAndUpdate(
    { sku_id: productData.skuId },
    { 
      $set: product,
      $setOnInsert: { created_at: new Date() }
    },
    { 
      upsert: true,
      returnDocument: 'after'
    }
  );

  return result;
}

/**
 * Batch upsert products (efficient for large datasets)
 * @param {Array} products - Array of product objects
 */
export async function batchUpsertProducts(products) {
  const database = await getDB();
  const inserted = [];
  const errors = [];

  try {
    const bulkOps = products.map(product => ({
      updateOne: {
        filter: { sku_id: product.skuId },
        update: {
          $set: {
            sku_id: product.skuId,
            barcode_uzum: product.barcode_uzum || null,
            barcode_billz: product.barcode_billz || null,
            product_title: product.productTitle || null,
            amount: product.amount || 0,
            price: product.price || 0,
            updated_at: new Date(),
          },
          $setOnInsert: { created_at: new Date() }
        },
        upsert: true
      }
    }));

    const result = await database.collection('products').bulkWrite(bulkOps, { ordered: false });
    
    console.log(`✓ Batch upsert: ${result.upsertedCount + result.modifiedCount} products saved`);
    
    return { 
      inserted: Array(result.upsertedCount + result.modifiedCount).fill({}),
      errors: [] 
    };
  } catch (error) {
    console.error('Batch upsert error:', error.message);
    return { inserted: [], errors: [{ error: error.message }] };
  }
}

/**
 * Get product by SKU ID
 */
export async function getProductBySkuId(skuId) {
  const database = await getDB();
  const product = await database.collection('products').findOne({ sku_id: skuId });
  return product;
}

/**
 * Get product by Uzum barcode
 */
export async function getProductByBarcodeUzum(barcode) {
  const database = await getDB();
  const product = await database.collection('products').findOne({ barcode_uzum: barcode });
  return product;
}

/**
 * Get product by Billz barcode
 */
export async function getProductByBarcodeBillz(barcode) {
  const database = await getDB();
  const product = await database.collection('products').findOne({ barcode_billz: barcode });
  return product;
}

/**
 * Get all products with pagination
 */
export async function getAllProducts(limit = 100, offset = 0) {
  const database = await getDB();
  const products = await database.collection('products')
    .find({})
    .sort({ updated_at: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();
  
  return products;
}

/**
 * Search products by title
 */
export async function searchProductsByTitle(searchTerm, limit = 50) {
  const database = await getDB();
  const products = await database.collection('products')
    .find({ 
      product_title: { $regex: searchTerm, $options: 'i' }
    })
    .sort({ product_title: 1 })
    .limit(limit)
    .toArray();
  
  return products;
}

/**
 * Get products with low/zero stock
 */
export async function getProductsLowStock(threshold = 0) {
  const database = await getDB();
  const products = await database.collection('products')
    .find({ amount: { $lte: threshold } })
    .sort({ amount: 1, product_title: 1 })
    .toArray();
  
  return products;
}

/**
 * Get products count
 */
export async function getProductsCount() {
  const database = await getDB();
  const count = await database.collection('products').countDocuments();
  return count;
}

/**
 * Update product amount (quantity)
 */
export async function updateProductAmount(skuId, amount) {
  const database = await getDB();
  const result = await database.collection('products').findOneAndUpdate(
    { sku_id: skuId },
    { 
      $set: { 
        amount: amount,
        updated_at: new Date()
      }
    },
    { returnDocument: 'after' }
  );
  
  return result;
}

/**
 * Update product price
 */
export async function updateProductPrice(skuId, price) {
  const database = await getDB();
  const result = await database.collection('products').findOneAndUpdate(
    { sku_id: skuId },
    { 
      $set: { 
        price: price,
        updated_at: new Date()
      }
    },
    { returnDocument: 'after' }
  );
  
  return result;
}

/**
 * Delete product by SKU ID
 */
export async function deleteProduct(skuId) {
  const database = await getDB();
  const result = await database.collection('products').findOneAndDelete({ sku_id: skuId });
  return result;
}

/**
 * Get database statistics
 */
export async function getStats() {
  const database = await getDB();
  
  const [
    totalProducts,
    inStockProducts,
    outOfStockProducts,
    totalSyncs,
    successfulSyncs,
  ] = await Promise.all([
    database.collection('products').countDocuments(),
    database.collection('products').countDocuments({ amount: { $gt: 0 } }),
    database.collection('products').countDocuments({ amount: 0 }),
    database.collection('sync_logs').countDocuments(),
    database.collection('sync_logs').countDocuments({ status: 'success' }),
  ]);

  const totalQuantityResult = await database.collection('products').aggregate([
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]).toArray();

  const avgPriceResult = await database.collection('products').aggregate([
    { $match: { price: { $gt: 0 } } },
    { $group: { _id: null, avg: { $avg: '$price' } } }
  ]).toArray();

  const lastSyncResult = await database.collection('sync_logs')
    .find({})
    .sort({ created_at: -1 })
    .limit(1)
    .toArray();

  return {
    total_products: totalProducts,
    in_stock_products: inStockProducts,
    out_of_stock_products: outOfStockProducts,
    total_quantity: totalQuantityResult[0]?.total || 0,
    avg_price: avgPriceResult[0]?.avg || 0,
    total_syncs: totalSyncs,
    successful_syncs: successfulSyncs,
    last_sync: lastSyncResult[0]?.created_at || null,
  };
}

// Initialize connection on module load
// connect().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing MongoDB connection...');
  await closeConnection();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing MongoDB connection...');
  await closeConnection();
  process.exit(0);
});

export default {
  connect,
  getDB,
  closeConnection,
  // Sync logs
  createSyncLog,
  updateSyncLog,
  getRecentSyncLogs,
  // Products
  upsertProduct,
  batchUpsertProducts,
  getProductBySkuId,
  getProductByBarcodeUzum,
  getProductByBarcodeBillz,
  getAllProducts,
  searchProductsByTitle,
  getProductsLowStock,
  getProductsCount,
  updateProductAmount,
  updateProductPrice,
  deleteProduct,
  getStats,
};