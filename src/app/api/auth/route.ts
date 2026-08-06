import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Fallback credentials for when database credentials are not set yet (first-time setup)
const FALLBACK_CREDENTIALS: Record<string, { password: string; role: string; name: string; userId: string }> = {
  founder: { password: 'Founder@2025', role: 'FOUNDER', name: 'Founder Sir', userId: 'user-founder1' },
  admin: { password: 'Laxree@2025', role: 'ADMIN', name: 'Samarth Sir', userId: 'user-admin' },
  ea: { password: 'EA@Laxree', role: 'EA', name: 'Arti Sharma', userId: 'user-ea1' },
  ashish: { password: 'Ashish@2025', role: 'DIRECTOR', name: 'Ashish Sir', userId: 'user-dir3' },
  samarth: { password: 'Samarth@2025', role: 'DIRECTOR', name: 'Samarth Sir', userId: 'user-dir4' },
  aditya: { password: 'Aditya@2025', role: 'EMPLOYEE', name: 'Aditya Sharma', userId: 'user-emp1' },
  aakash: { password: 'Aakash@2025', role: 'EMPLOYEE', name: 'Aakash', userId: 'user-emp2' },
  anamika: { password: 'Anamika@2025', role: 'EMPLOYEE', name: 'Anamika', userId: 'user-emp3' },
  saurabh: { password: 'Saurabh@2025', role: 'EMPLOYEE', name: 'Saurabh', userId: 'user-emp4' },
  ruchi: { password: 'Ruchi@2025', role: 'EMPLOYEE', name: 'Ruchi', userId: 'user-emp5' },
  aayush: { password: 'Aayush@2025', role: 'EMPLOYEE', name: 'Aayush', userId: 'user-emp6' },
  kamlesh: { password: 'Kamlesh@2025', role: 'EMPLOYEE', name: 'Kamlesh', userId: 'user-emp7' },
  hitesh: { password: 'Hitesh@2025', role: 'EMPLOYEE', name: 'Hitesh Tak', userId: 'user-emp8' },
  khushboo: { password: 'Khushboo@2025', role: 'MANAGER', name: 'Khushboo Manglani', userId: 'user-mgr1' },
  radhika: { password: 'Radhika@2025', role: 'MANAGER', name: 'Radhika', userId: 'user-mgr2' },
  tanuja: { password: 'Tanuja@2025', role: 'MANAGER', name: 'Tanuja Tigaya', userId: 'user-mgr3' },
}

// POST /api/auth - Login endpoint
// First checks database for loginUsername/loginPassword, then falls back to hardcoded credentials
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }

    // Step 1: Try to authenticate using database credentials (loginUsername/loginPassword)
    // We check BOTH the explicit loginUsername AND a name-based fallback.
    // The name-based fallback handles legacy/migrated users whose loginUsername
    // is NULL (they were created before the user-management UI started auto-
    // generating loginUsername from the first name). Without this fallback,
    // those users can NEVER log in, even with the correct password.
    const usernameLower = username.toLowerCase()
    const firstNameGuess = usernameLower.split(/[ @]/)[0]  // strip "@domain" or trailing tokens
    const dbUser = await db.user.findFirst({
      where: {
        OR: [
          { loginUsername: usernameLower },
          { loginUsername: null, name: { startsWith: firstNameGuess, mode: 'insensitive' } },
        ],
        isActive: true,
      },
    })

    if (dbUser && dbUser.loginPassword && dbUser.loginPassword === password) {
      // Database auth successful
      // ─── LAZY REPAIR ───────────────────────────────────────────────
      // If loginUsername was NULL (legacy user) and the user successfully
      // authenticated via the name-based fallback, lazily populate the
      // loginUsername so future logins hit the fast path. This is purely
      // additive — only the empty field is filled in, no other data changes.
      if (!dbUser.loginUsername) {
        try {
          await db.user.update({
            where: { id: dbUser.id },
            data: { loginUsername: usernameLower },
          })
          console.log(`[auth] Lazy-filled loginUsername="${usernameLower}" for user ${dbUser.id}`)
        } catch (repairErr) {
          // Non-fatal — the user is already authenticated; just log and continue
          console.warn(`[auth] Could not lazy-fill loginUsername for ${dbUser.id}:`, repairErr)
        }
      }
      return NextResponse.json({
        id: dbUser.id,
        name: dbUser.name,
        role: dbUser.role,
        department: dbUser.department || null,
        email: dbUser.email,
      })
    }

    // Step 2: Fall back to hardcoded credentials for users not yet migrated to DB auth
    const cred = FALLBACK_CREDENTIALS[username.toLowerCase()]
    if (!cred || cred.password !== password) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // v25·0806-security: Check if the user corresponding to this fallback cred
    // is still active in the database. If they've been deactivated (e.g. their
    // HRMS record is now inactive), refuse login — even though the hardcoded
    // password matches. Without this check, a deactivated user could log in
    // and (worse) get matched to a DIFFERENT active user via the role fallback
    // below — impersonating another employee. This was the Aayush bug: his
    // HRMS record was inactive but his fallback cred still worked, and the
    // role-match fallback returned Girish's user ID.
    const credUserActive = await db.user.findFirst({
      where: { id: cred.userId },
      select: { id: true, isActive: true, name: true },
    })
    if (credUserActive && credUserActive.isActive === false) {
      // User exists in DB but has been deactivated — refuse login.
      return NextResponse.json(
        { error: 'Account is inactive. Please contact HR.' },
        { status: 403 }
      )
    }

    // Find the user in the database by ID or (name + role).
    // v25·0806-security: Removed the previous "role match" fallback that
    // returned ANY active user with the same role — that was an impersonation
    // vulnerability. If we can't find the specific user, we either auto-create
    // them (if cred.userId is set) or refuse login.
    let dbMatch = await db.user.findFirst({
      where: {
        OR: [
          { id: cred.userId },
          { name: cred.name, role: cred.role as any },
        ],
        isActive: true,
      },
    })

    // ─── AUTO-CREATE missing fallback user (e.g., FOUNDER) ───────────────
    // The FOUNDER role is new — its user record (user-founder1) doesn't exist
    // in the production DB yet. Without it, the foreign-key constraint on
    // Task.assignedById would reject any task FOUNDER assigns. To avoid this
    // (and to avoid asking the user to manually run a seed), we lazily create
    // the user record on first login. This is purely additive — it does NOT
    // modify or delete any existing data.
    if (!dbMatch && cred.userId) {
      try {
        dbMatch = await db.user.create({
          data: {
            id: cred.userId,
            email: `${cred.userId}@laxree.com`,
            name: cred.name,
            role: cred.role,
            department: 'Management',
            designation: cred.role === 'FOUNDER' ? 'Founder' : cred.role.charAt(0) + cred.role.slice(1).toLowerCase(),
            isActive: true,
            loginUsername: username.toLowerCase(),
            loginPassword: password,
            joinDate: new Date(),
          },
        })
        console.log(`[auth] Auto-created ${cred.role} user "${cred.name}" (id=${cred.userId})`)
      } catch (createErr) {
        // Race condition: another concurrent login already created it.
        // Re-fetch instead of crashing.
        console.warn('[auth] Auto-create failed, refetching:', createErr)
        dbMatch = await db.user.findFirst({ where: { id: cred.userId } })
          || await db.user.findFirst({ where: { loginUsername: username.toLowerCase() } })
          || null
      }
    }

    return NextResponse.json({
      id: dbMatch?.id || cred.userId,
      name: cred.name,
      role: cred.role,
      department: dbMatch?.department || null,
      email: dbMatch?.email || `${username}@laxree.com`,
    })
  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
