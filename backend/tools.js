// tools.js
import { Type } from '@mariozechner/pi-ai';
import mongoose from 'mongoose';

// Re-use or declare the DataLog mongoose model schema internally for DB operations
const DataLogSchema = new mongoose.Schema({
  collectionName: String,
  payload: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});

// Ensure the model compilation doesn't overwrite itself during hot reloads
const DataLog = mongoose.models.DataLog || mongoose.model('DataLog', DataLogSchema);

// ==========================================
// TOOL 1: WRITE TO DATABASE
// ==========================================
export const writeToDatabaseTool = {
  name: 'write_to_database',
  label: 'Write to Database',
  description: 'Store or update data records inside the database repository.',
  parameters: Type.Object({
    targetCollection: Type.String({ description: 'Name classification of the data collection (e.g., user_db)' }),
    dataObject: Type.Object({}, { description: 'The JSON payload dictionary containing user information to store', additionalProperties: true })
  }),
  execute: async (_toolCallId, args) => {
    const { targetCollection, dataObject } = args;
    console.log(`⚡ [Pi Executor Module]: Writing to MongoDB -> ${targetCollection}`);
    try {
      const savedDoc = await new DataLog({ collectionName: targetCollection, payload: dataObject }).save();
      return { content: [{ type: 'text', text: `Success: Saved to ${targetCollection}, ID: ${savedDoc._id}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Database Write Failure: ${err.message}` }] };
    }
  }
};

// ==========================================
// TOOL 2: READ LATEST DATABASE ENTRY
// ==========================================
export const readLatestDatabaseEntryTool = {
  name: 'read_latest_database_entry',
  label: 'Read Latest Database Entry',
  description: 'Query the most recent record matching a collection identifier to check for sync status.',
  parameters: Type.Object({
    targetCollection: Type.String({ description: 'Name classification of the targeted database collection' })
  }),
  execute: async (_toolCallId, args) => {
    const { targetCollection } = args;
    console.log(`🔍 [Pi Executor Module]: Querying latest entry from -> ${targetCollection}`);
    try {
      const latest = await DataLog.findOne({ collectionName: targetCollection }).sort({ timestamp: -1 });
      return { content: [{ type: 'text', text: latest ? JSON.stringify(latest.payload) : JSON.stringify({ message: 'No records found.' }) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Database Read Failure: ${err.message}` }] };
    }
  }
};

// ==========================================
// TOOL 3: FETCH EXTERNAL API
// ==========================================
export const fetchExternalApiTool = {
  name: 'fetch_external_api',
  label: 'Fetch External API',
  description: 'Fetch raw data or mock data parameters from any public HTTP API endpoint URL.',
  parameters: Type.Object({
    url: Type.String({ description: 'The complete public endpoint URL string to request data from' })
  }),
  execute: async (_toolCallId, args) => {
    const { url } = args;
    console.log(`🌐 [Pi Executor Module]: Initiating external HTTP request to -> ${url}`);
    try {
      const res = await fetch(url);
      const textOutput = await res.text();
      return { content: [{ type: 'text', text: textOutput }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `API Fetch Error: ${err.message}` }] };
    }
  }
};

// Unified Master List Array Export
export const piToolsList = [
  fetchExternalApiTool,
  writeToDatabaseTool,
  readLatestDatabaseEntryTool
];

// High-priority system instruction prompt template
export const coreSystemInstruction = 
  'You are an autonomous operations engineer. Execute tasks using available tools sequentially. ' +
  'Always prioritize using tools to mutate or fetch application state—never just describe what you would do. ' +
  'Maintain strict formatting rules and summarize outputs operationally.';