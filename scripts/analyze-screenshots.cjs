// Analyze two screenshots using z-ai-web-dev-sdk VLM
const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');
const path = require('path');

(async () => {
  const zai = await ZAI.create();

  const files = [
    'pasted_image_1786077740931.png',
    'pasted_image_1786077773918.png',
  ];

  const prompt =
    'Describe this screenshot in detail. Focus on: ' +
    '(1) what page/UI is shown, ' +
    '(2) any empty space on the side (the user calls this "side mein khali jgh"), ' +
    '(3) any unnecessary or unwanted content showing (especially on a founder page), ' +
    '(4) any punch-in related UI (e.g. time/attendance punch), ' +
    '(5) any scoring / HR report / audit related UI. ' +
    'Be specific about what you see and any visual issues such as layout gaps, blank panels, misaligned sections, or extra widgets.';

  for (const file of files) {
    const imagePath = path.join('/home/z/my-project/upload', file);
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    try {
      const completion = await zai.chat.completions.createVision({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      });

      console.log(`\n========== ${file} ==========`);
      console.log(completion.choices[0].message.content);
    } catch (err) {
      console.log(`\n========== ${file} ==========`);
      console.log('ERROR analyzing image:', err && err.message ? err.message : err);
    }
  }
})();
