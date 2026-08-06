import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeCredentials = searchParams.get('includeCredentials') === 'true'

    // SECURITY: Credentials (loginUsername / loginPassword) are returned ONLY
    // when includeCredentials=true is explicitly passed. The UI must only
    // send this flag from the FOUNDER role on the User Management page.
    const select: Record<string, boolean> = {
      id: true,
      email: true,
      name: true,
      role: true,
      department: true,
      designation: true,
      phone: true,
      location: true,
      avatar: true,
      isActive: true,
      joinDate: true,
      createdAt: true,
    }
    if (includeCredentials) {
      select.loginUsername = true
      select.loginPassword = true
    }

    const users = await db.user.findMany({
      where: { isActive: true },
      select,
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(Array.isArray(users) ? users : [])
  } catch (error) {
    console.error('Users GET error:', error)
    // Return empty array instead of error object to prevent .filter() crashes on frontend
    return NextResponse.json([])
  }
}

// POST /api/users — Create new user (EA only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, role, department, designation, phone, location, loginUsername, loginPassword } = body

    if (!name || !email || !role) {
      return NextResponse.json({ error: 'name, email, and role are required' }, { status: 400 })
    }

    // Check if email already exists
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }

    // ─── Generate a UNIQUE loginUsername ─────────────────────────────
    // The loginUsername column has a @unique constraint. If two users have
    // the same first name (e.g. "Rahul"), the second creation would fail
    // with a unique constraint violation. We avoid this by appending a
    // numeric suffix until we find a free username.
    const baseUsername = (loginUsername && loginUsername.trim())
      ? loginUsername.trim().toLowerCase()
      : (name.split(' ')[0] || name).toLowerCase().replace(/[^a-z0-9._-]/g, '')

    let finalUsername = baseUsername || 'user'
    let suffix = 2
    // Loop until we find a username that is not taken (by another user)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const clash = await db.user.findUnique({ where: { loginUsername: finalUsername } })
      if (!clash) break
      finalUsername = `${baseUsername}${suffix}`
      suffix += 1
      if (suffix > 1000) {
        // Safety valve — extremely unlikely
        finalUsername = `${baseUsername}_${Date.now()}`
        break
      }
    }

    const user = await db.user.create({
      data: {
        name,
        email,
        role,
        department: department || null,
        designation: designation || null,
        phone: phone || null,
        location: location || null,
        loginUsername: finalUsername,
        loginPassword: loginPassword || null,
        isActive: true,
        joinDate: new Date(),
      },
    })

    return NextResponse.json({ user, loginUsername: finalUsername, loginPassword }, { status: 201 })
  } catch (error) {
    console.error('Users POST error:', error)
    return NextResponse.json({ error: 'Failed to create user: ' + (error instanceof Error ? error.message : 'Unknown error') }, { status: 500 })
  }
}

// PATCH /api/users — Update user (EA only)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, email, role, department, designation, phone, location, isActive, loginPassword, loginUsername } = body

    if (!id) {
      return NextResponse.json({ error: 'User id is required' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (role !== undefined) updateData.role = role
    if (department !== undefined) updateData.department = department
    if (designation !== undefined) updateData.designation = designation
    if (phone !== undefined) updateData.phone = phone
    if (location !== undefined) updateData.location = location
    if (isActive !== undefined) updateData.isActive = isActive
    if (loginPassword !== undefined) updateData.loginPassword = loginPassword

    // ─── Allow updating loginUsername ───────────────────────────────
    // Needed to repair legacy users whose loginUsername is NULL (e.g.,
    // users created before the user-management UI auto-generated it,
    // or users migrated from another system). We also enforce uniqueness
    // here so the PATCH never accidentally creates a clash.
    if (loginUsername !== undefined) {
      const trimmed = String(loginUsername || '').trim().toLowerCase()
      if (trimmed) {
        // Ensure no OTHER user already has this loginUsername
        const clash = await db.user.findFirst({
          where: { loginUsername: trimmed, NOT: { id } },
        })
        if (clash) {
          return NextResponse.json(
            { error: `Login username "${trimmed}" is already used by ${clash.name}` },
            { status: 400 },
          )
        }
        updateData.loginUsername = trimmed
      } else {
        // Empty string → set to NULL (disables DB-auth login for this user)
        updateData.loginUsername = null
      }
    }

    const user = await db.user.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Users PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update user: ' + (error instanceof Error ? error.message : 'Unknown error') }, { status: 500 })
  }
}

// DELETE /api/users — Soft delete user (EA only)
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'User id is required' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Soft delete — mark as inactive instead of deleting
    const user = await db.user.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ user, message: 'User deactivated successfully' })
  } catch (error) {
    console.error('Users DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
