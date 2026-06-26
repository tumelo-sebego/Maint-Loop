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
const fetchExternalApiTool = {
  name: 'fetch_external_api',
  description: 'Fetch raw data from any public HTTP API endpoint URL.',
  execute: async (_toolCallId, args) => {
    console.log(`Executing Pi Tool [fetch_external_api] for: ${args.url}`);
    const res = await fetch(args.url);
    const textOutput = await res.text();
    return { content: [{ type: "text", text: textOutput }] };
  }
};

const writeToDatabaseTool = {
  name: 'write_to_database',
  description: 'Store or update data records inside the database repository.',
  execute: async (_toolCallId, args) => {
    console.log(`Executing Pi Tool [write_to_database] under classification: ${args.targetCollection}`);
    const newRecord = new DataLog({ collectionName: args.targetCollection, payload: args.dataObject });
    const savedDoc = await newRecord.save();
    return { 
      content: [{ type: "text", text: JSON.stringify({ success: true, id: savedDoc._id }) }] 
    };
  }
};

const readLatestDatabaseEntryTool = {
  name: 'read_latest_database_entry',
  description: 'Query the most recent record matching a collection identifier to check for sync status.',
  execute: async (_toolCallId, args) => {
    console.log(`Executing Pi Tool [read_latest_database_entry] for: ${args.targetCollection}`);
    const latest = await DataLog.findOne({ collectionName: args.targetCollection }).sort({ timestamp: -1 });
    const textOutput = latest ? JSON.stringify(latest.payload) : JSON.stringify({ message: "No records found." });
    return { content: [{ type: "text", text: textOutput }] };
  }
};

// Assemble tools list array for the core configuration setup
const piToolsList = [fetchExternalApiTool, writeToDatabaseTool, readLatestDatabaseEntryTool];

// ==========================================
// 2. THE PI RUNTIME STRATEGY ENGINE
// ==========================================
async function runAgentOrchestrator(userInstruction) {
  try {
    // 1. Initialize the target model layer via Pi multi-provider system abstraction
    // Map your local or remote instance endpoint cleanly
    const model = getModel('openai', {
      baseURL: 'https://ollama.com/api/chat',
      apiKey: process.env.OLLAMA_API_KEY,
      defaultModel: 'gemma4:31b'
    });

    // 2. Instantiating the official Pi structural Agent block
    const agent = new Agent({
      initialState: {
        systemPrompt: 'You are an autonomous operations engineer. Execute tasks using available tools sequentially. If a task requires a tool you do not have, state clearly which tool is missing.',
        model,
        tools: piToolsList
      }
    });

    // 3. Setup dynamic subscription streams to watch what the agent is doing in real-time
    agent.subscribe(async (event) => {
      // Pipeline these event states directly to MongoDB or print to console logs for debugging
      if (event.type === 'tool_execution_start') {
        console.log(`🔧 [Pi Engine State]: Using tool tool -> ${event.toolName}`);
      }
      
      if (event.type === 'message_end' && event.message?.role === 'assistant') {
        console.log(`[Pi Final Report Iteration]: ${event.message.content}`);
      }
    });

    // 4. Dispatch user instructions to the unified prompt thread engine handler loop
    await agent.prompt(userInstruction);

  } catch (error) {
    console.error('❌ Pi Agent Core Error Intercepted:', error.message);
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