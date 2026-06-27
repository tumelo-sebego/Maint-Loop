import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Agent } from '@mariozechner/pi-agent-core';
import { streamSimple } from '@mariozechner/pi-ai';
import { Type } from '@mariozechner/pi-ai';

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
// 1. TOOLS
// ==========================================
const fetchExternalApiTool = {
  name: 'fetch_external_api',
  label: 'Fetch External API',
  description: 'Fetch raw data from any public HTTP API endpoint URL.',
  parameters: Type.Object({
    url: Type.String({ description: 'The complete endpoint URL to request data from' })
  }),
  execute: async (_toolCallId, args) => {
    console.log(`Executing Pi Tool [fetch_external_api] for: ${args.url}`);
    try {
      const res = await fetch(args.url);
      return { content: [{ type: 'text', text: await res.text() }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `API Fetch Error: ${err.message}` }] };
    }
  }
};

const writeToDatabaseTool = {
  name: 'write_to_database',
  label: 'Write to Database',
  description: 'Store or update data records inside the database.',
  parameters: Type.Object({
    targetCollection: Type.String({ description: 'Name of the data collection e.g. mock_users' }),
    dataObject: Type.Object({}, { description: 'The JSON payload to store', additionalProperties: true })
  }),
  execute: async (_toolCallId, args) => {
    const { targetCollection, dataObject } = args;
    console.log(`⚡ [Pi Executor]: Writing to MongoDB -> ${targetCollection}`);
    try {
      const savedDoc = await new DataLog({ collectionName: targetCollection, payload: dataObject }).save();
      return { content: [{ type: 'text', text: `Success: Saved to ${targetCollection}, ID: ${savedDoc._id}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Database Write Failure: ${err.message}` }] };
    }
  }
};

const readLatestDatabaseEntryTool = {
  name: 'read_latest_database_entry',
  label: 'Read Latest Database Entry',
  description: 'Query the most recent record in a collection.',
  parameters: Type.Object({
    targetCollection: Type.String({ description: 'Name of the targeted database collection' })
  }),
  execute: async (_toolCallId, args) => {
    console.log(`Executing Pi Tool [read_latest_database_entry] for: ${args.targetCollection}`);
    try {
      const latest = await DataLog.findOne({ collectionName: args.targetCollection }).sort({ timestamp: -1 });
      return { content: [{ type: 'text', text: latest ? JSON.stringify(latest.payload) : JSON.stringify({ message: 'No records found.' }) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Database Read Failure: ${err.message}` }] };
    }
  }
};

// ==========================================
// 2. OLLAMA CLOUD MODEL DEFINITION
// ==========================================
const ollamaCloudModel = {
  id: process.env.OLLAMA_MODEL || 'gemma4:27b',
  name: 'Ollama Cloud Model',
  api: 'openai-completions',
  provider: 'ollama-cloud',
  baseUrl: 'https://ollama.com/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 8192,
};

// ==========================================
// 3. AGENT ENGINE
// ==========================================
async function runAgentOrchestrator(userInstruction) {
  console.log(`[Engine Activation]: Initializing Pi Agent loop for prompt: "${userInstruction}"`);

  try {
    const agent = new Agent({
      initialState: {
        model: ollamaCloudModel,
        systemPrompt: 'You are an autonomous operations engineer. Execute tasks using available tools sequentially. Always use tools to complete tasks - never just describe what you would do.',
        tools: [fetchExternalApiTool, writeToDatabaseTool, readLatestDatabaseEntryTool],
        messages: [],
      }
    });

    // KEY FIX: Override streamFn to explicitly pass the API key and auth header.
    // Without this, pi-ai cannot resolve the key for custom providers and sends
    // unauthenticated requests, getting back empty responses silently.
    agent.streamFn = (model, context, options) => {
      return streamSimple(model, context, {
        ...options,
        apiKey: process.env.OLLAMA_API_KEY,  // explicitly inject the key
        headers: {
          'Authorization': `Bearer ${process.env.OLLAMA_API_KEY}`
        }
      });
    };

    agent.subscribe(async (event) => {
      console.log(`📡 [Pi Raw Event Stream]: Received type -> "${event.type}"`);
      if (event.type === 'tool_execution_start') {
        console.log(`🔧 [Pi Tool Action]: Executing -> ${event.toolName}`);
      }
      if (event.type === 'message_end') {
        console.log(`📝 [Pi Turn Content]:`, event.message?.content);
      }
    });

    console.log(`[Engine Activation]: Subscriptions active. Dispatching to LLM...`);
    await agent.prompt(userInstruction);
    console.log(`[Engine Success]: Pi Agent concluded execution.`);

  } catch (error) {
    console.error('❌ CRITICAL: Pi Agent Core Error:', error.stack);
  }
}

// ==========================================
// 4. ENDPOINT
// ==========================================
app.post('/run-instruction', (req, res) => {
  const instruction = req.body.instruction;
  res.status(200).json({ status: 'accepted', message: 'Pi Agent processing started.' });
  runAgentOrchestrator(instruction);
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(3000, () => console.log('Server running on port 3000')))
  .catch(err => console.error(err));