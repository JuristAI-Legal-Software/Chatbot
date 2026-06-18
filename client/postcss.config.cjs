module.exports = {
  plugins: [
    require('postcss-import'),
    require('postcss-preset-env')({
      features: {
        'is-pseudo-class': false,
      },
    }),
    require('tailwindcss'),
    require('autoprefixer'),
  ],
};
