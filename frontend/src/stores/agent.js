import { defineStore } from 'pinia';

export const useAgentStore = defineStore('agent', {
  state: () => ({
    currentGame: 'daily_lotto',
    globalPrompt: 'Phase 1: Ingest records... Phase 2: Analyze stats...',
    liveExecutionLogs: 'System idle. Awaiting instruction hook sync...',
    isAgentRunning: false,
    gameStats: [],
    chatHistory: []
  }),
  actions: {
    async triggerAgentTask() {
      this.isAgentRunning = true;
      this.liveExecutionLogs = '[⚙] Initializing pipeline connection...';
      
      try {
        const response = await fetch('/api/run-instruction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction: this.globalPrompt })
        });
        const data = await response.json();
        this.liveExecutionLogs = `[✓] Response accepted: ${data.message}`;
      } catch (error) {
        this.liveExecutionLogs = `[Error]: ${error.message}`;
      } finally {
        this.isAgentRunning = false;
      }
    }
  }
});