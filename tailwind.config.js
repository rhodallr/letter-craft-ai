/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#10145C', // navy ink: text and borders
        royal: '#2A33E8', // fountain-pen blue: active states, the desk
        stamp: '#FF4A2E', // postage red: the main action
        marker: '#FFE35A', // highlighter: candidate notes
        envelope: '#EEF0FB', // workspace background
        sheet: '#FFFFFF',
      },
      fontFamily: {
        sans: ['"Schibsted Grotesk Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        letterSerif: ['Tinos', '"Times New Roman"', 'Times', 'serif'],
        letterSans: ['Arimo', 'Arial', 'Helvetica', 'sans-serif'],
      },
      boxShadow: {
        hard: '4px 4px 0 0 #10145C',
        'hard-sm': '2px 2px 0 0 #10145C',
        'hard-lg': '8px 8px 0 0 #10145C',
      },
    },
  },
  plugins: [],
};
