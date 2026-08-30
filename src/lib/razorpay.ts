import Razorpay from 'razorpay';
import dotenv from 'dotenv';

dotenv.config();

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (!keyId || !keySecret) {
  console.warn(
    '[Razorpay] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing in environment variables.'
  );
}

const globalForRazorpay = globalThis as unknown as {
  razorpay: Razorpay | undefined;
};

export const razorpay =
  globalForRazorpay.razorpay ??
  new Razorpay({
    key_id: keyId || '',
    key_secret: keySecret || '',
  });

if (process.env.NODE_ENV !== 'production') {
  globalForRazorpay.razorpay = razorpay;
}

export { Razorpay };
export default razorpay;
