import { getOrCreateStaffUser } from './src/modules/auth/auth.service'

async function run() {
  try {
    const res = await getOrCreateStaffUser('test@turnogol.com', 'Test', 'User', null)
    console.log('Success:', res)
  } catch (e) {
    console.error('Error:', e)
  }
}
run()
