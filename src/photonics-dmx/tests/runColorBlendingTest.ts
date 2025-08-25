#!/usr/bin/env node

/**
 * Simple test runner for the Color Blending Test
 * 
 * Run this with: npx ts-node runColorBlendingTest.ts
 * or: npm run test:color-blending
 */

import { runColorBlendingTest } from './ColorBlendingTest';

async function main() {
  console.log('🚀 Starting Color Blending Test Runner...');
  console.log('=====================================');
  
  try {
    await runColorBlendingTest();
    console.log('=====================================');
    console.log('✅ Test completed successfully!');
  } catch (error) {
    console.error('=====================================');
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  main();
}

export { main as runColorBlendingTestRunner };
