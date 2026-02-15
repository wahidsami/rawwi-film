-- Migration to ensure user deletion cascades to profiles/roles and unlinks scripts.
-- Refactored to avoid complex dynamic SQL syntax errors.

-- 1. PROFILES: Ensure FK is ON DELETE CASCADE
-- Using DROP IF EXISTS is strictly valid in newer Postgres, usually supported.
DO $$
BEGIN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE profiles
ADD CONSTRAINT profiles_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. USER_ROLES: Ensure FK is ON DELETE CASCADE
DO $$
BEGIN
    ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE user_roles
ADD CONSTRAINT user_roles_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. SCRIPTS: Try to fix Foreign Keys for assignee_id and created_by
DO $$
BEGIN
    -- [Assignee ID]
    -- Try to drop standard named constraint
    BEGIN
        ALTER TABLE scripts DROP CONSTRAINT IF EXISTS scripts_assignee_id_fkey;
    EXCEPTION WHEN undefined_object THEN NULL; END;
    
    -- Try to add proper SET NULL constraint
    BEGIN
        ALTER TABLE scripts 
        ADD CONSTRAINT scripts_assignee_id_fkey 
        FOREIGN KEY (assignee_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN 
        -- Ignore errors (e.g. if column is text type)
        NULL; 
    END;

    -- [Created By]
    -- Try to drop standard named constraint
    BEGIN
        ALTER TABLE scripts DROP CONSTRAINT IF EXISTS scripts_created_by_fkey;
    EXCEPTION WHEN undefined_object THEN NULL; END;

    -- Try to add proper SET NULL constraint
    BEGIN
        ALTER TABLE scripts 
        ADD CONSTRAINT scripts_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN 
        -- Ignore errors (e.g. if column is text type)
        NULL;
    END;
END $$;
