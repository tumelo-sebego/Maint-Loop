import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Agent } from '@mariozechner/pi-agent-core';
import { Ollama } from 'ollama'; // <-- use the official ollama npm package directly

dotenv.config();
const app = express();
app.use(express.json());

const DataLogSchema = new mongoose.Schema({
  collectionName: String,
  payload: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});
const DataLog = mongoose.model('DataLog', DataLogSchema);

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

const piToolsList = [fetchExternalApiTool, writeToDatabaseTool, readLatestDatabaseEntryTool];

// ==========================================
// 2. OLLAMA CLOUD CLIENT SETUP
// ==========================================
// Directly instantiate the official Ollama client pointed at the cloud API
const ollamaClient = new Ollama({
  host: 'https://ollama.com',
  headers: {
    Authorization: 'Bearer ' + process.env.OLLAMA_API_KEY
  }
});

// Build a model adapter that Pi Agent's Agent class can consume.
// Pi expects an object with a `complete` (or equivalent) method that
// accepts messages and returns a standard response. We wrap ollamaClient here.
const ollamaModel = {
  // Pi Agent core calls this internally when it needs a completion
  complete: async ({ messages, tools }) => {
    const response = await ollamaClient.chat({
      model: process.env.OLLAMA_MODEL || 'gemma4:31b', // set in your .env
      messages,
      tools: tools ?? [],
      stream: false
    });
    return response; // ollama returns { message: { role, content, tool_calls? } }
  }
};

// ==========================================
// 3. THE PI RUNTIME STRATEGY ENGINE
// ==========================================
async function runAgentOrchestrator(userInstruction) {
  console.log(`[Engine Activation]: Initializing Pi Agent loop for prompt: "${userInstruction}"`);

  try {
    const agent = new Agent({
      model: ollamaModel,
      tools: piToolsList,
      initialState: {
        systemPrompt: 'You are an autonomous operations engineer. Execute tasks using available tools sequentially.',
      }
    });

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
    console.error('❌ CRITICAL: Pi Agent Core Error Intercepted:', error.stack);
  }
}

// ==========================================
// 4. UNIVERSAL ENDPOINT
// ==========================================
app.post('/run-instruction', (req, res) => {
  const instruction = req.body.instruction;

  res.status(200).json({ status: "accepted", message: "Instruction accepted. Pi Agent processing started." });

  runAgentOrchestrator(instruction);
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(3000, () => console.log('Server running on port 3000')))
  .catch(err => console.error(err));