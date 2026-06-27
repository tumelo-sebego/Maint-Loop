import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
// Import the core Pi SDK components
import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';

dotenv.config();
const app = express();
app.use(express.json());

// Dynamic schema that can accept any shape of object data saved by the agent
const DataLogSchema = new mongoose.Schema({
  collectionName: String,
  payload: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});
const DataLog = mongoose.model('DataLog', DataLogSchema);

// ==========================================
// 1. PI AGENT CUSTOM TOOLS CONFIGURATION
// ==========================================
// ==========================================
// 1. PI AGENT CUSTOM TOOLS CONFIGURATION
// ==========================================
const fetchExternalApiTool = {
  name: 'fetch_external_api',
  description: 'Fetch raw data from any public HTTP API endpoint URL.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The complete endpoint URL string to scrape or request data from' }
    },
    required: ['url']
  },
  execute: async (args) => {
    const { url } = args;
    console.log(`Executing Pi Tool [fetch_external_api] for: ${url}`);
    try {
      const res = await fetch(url);
      const textOutput = await res.text();
      return textOutput;
    } catch (err) {
      return `API Fetch Error: ${err.message}`;
    }
  }
};

const writeToDatabaseTool = {
  name: 'write_to_database',
  description: 'Store or update data records inside the database repository.',
  parameters: {
    type: 'object',
    properties: {
      targetCollection: { type: 'string', description: 'Name classification of the data collection (e.g. mock_users)' },
      dataObject: { type: 'object', description: 'The JSON payload dictionary containing user information to store' }
    },
    required: ['targetCollection', 'dataObject']
  },
  execute: async (args) => {
    const { targetCollection, dataObject } = args;
    console.log(`⚡ [Pi Executor Callback]: Writing to MongoDB -> ${targetCollection}`);
    try {
      const newRecord = new DataLog({ collectionName: targetCollection, payload: dataObject });
      const savedDoc = await newRecord.save();
      return `Success: Saved document to ${targetCollection} under reference ID: ${savedDoc._id}`;
    } catch (err) {
      return `Database Write Failure: ${err.message}`;
    }
  }
};

const readLatestDatabaseEntryTool = {
  name: 'read_latest_database_entry',
  description: 'Query the most recent record matching a collection identifier to check for sync status.',
  parameters: {
    type: 'object',
    properties: {
      targetCollection: { type: 'string', description: 'Name classification of the targeted database collection' }
    },
    required: ['targetCollection']
  },
  execute: async (args) => {
    const { targetCollection } = args;
    console.log(`Executing Pi Tool [read_latest_database_entry] for: ${targetCollection}`);
    try {
      const latest = await DataLog.findOne({ collectionName: targetCollection }).sort({ timestamp: -1 });
      return latest ? JSON.stringify(latest.payload) : JSON.stringify({ message: "No records found." });
    } catch (err) {
      return `Database Read Failure: ${err.message}`;
    }
  }
};

// Assemble tools list array for the core configuration setup
const piToolsList = [fetchExternalApiTool, writeToDatabaseTool, readLatestDatabaseEntryTool];

// ==========================================
// 2. THE PI RUNTIME STRATEGY ENGINE
// ==========================================
async function runAgentOrchestrator(userInstruction) {
  // Clear indicator that the background thread successfully spawned
  console.log(`[Engine Activation]: Initializing Pi Agent loop for prompt: "${userInstruction}"`);

  try {
    const model = getModel('ollama', 'gemma4:31b', {
  baseURL: 'https://ollama.com', // The SDK appends /api/chat natively underneath
  headers: {
    'Authorization': `Bearer ${process.env.OLLAMA_API_KEY}`
  }
});
    console.log(`[Engine Activation]: Provider configured. Instantiating runtime state tree...`);

    const agent = new Agent({
      model,
      tools: piToolsList,
      initialState: {
        systemPrompt: 'You are an autonomous operations engineer. Execute tasks using available tools sequentially.',
      }
    });

    // Track ALL raw lifecycle events to find out where things stall
    agent.subscribe(async (event) => {
      console.log(`📡 [Pi Raw Event Stream]: Received type -> "${event.type}"`);

      if (event.type === 'tool_execution_start') {
        console.log(`🔧 [Pi Tool Action]: Executing -> ${event.toolName}`);
      }
      
      if (event.type === 'message_end') {
        console.log(`📝 [Pi Turn Content]:`, event.message?.content);
      }
    });

    console.log(`[Engine Activation]: Subscriptions active. Dispatched prompt thread to LLM...`);
    
    await agent.prompt(userInstruction);
    
    console.log(`[Engine Success]: Pi Agent has successfully concluded the entire execution path.`);

  } catch (error) {
    // This will catch target connection failures instantly
    console.error('❌ CRITICAL: Pi Agent Core Error Intercepted:', error.stack);
  }
}

// ==========================================
// 3. UNIVERSAL ENDPOINT
// ==========================================
app.post('/run-instruction', (req, res) => {
  const instruction = req.body.instruction;
  
  res.status(200).json({ status: "accepted", message: "Instruction accepted. Pi Agent processing started." });
  
  // Hand control over to the unified Pi agent framework run system
  runAgentOrchestrator(instruction);
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(3000, () => console.log('Server running on port 3000')))
  .catch(err => console.error(err));