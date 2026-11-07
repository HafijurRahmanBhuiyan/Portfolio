import argon2 from 'argon2';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const password = input.replace(/[\r\n]+$/, '');
input = '';
if (password.length < 16) {
  console.error('Password must contain at least 16 characters.');
  process.exit(1);
}
console.log(
  await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  }),
);
