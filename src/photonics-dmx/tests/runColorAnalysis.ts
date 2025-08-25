#!/usr/bin/env node

/**
 * Simple runner for Color Blending Analysis
 * 
 * Run this with: npx ts-node runColorAnalysis.ts
 * or: npm run test:color-analysis
 */

import { analyzeBlueGreenBlending } from './ColorBlendingAnalysis';

async function main() {
  console.log('🔍 Color Blending Analysis Runner');
  console.log('==================================');
  
  try {
    analyzeBlueGreenBlending();
    console.log('\n✅ Analysis completed successfully!');
  } catch (error) {
    console.error('❌ Analysis failed with error:', error);
    process.exit(1);
  }
}

// Run the analysis if this file is executed directly
if (require.main === module) {
  main();
}

export { main as runColorAnalysisRunner };
