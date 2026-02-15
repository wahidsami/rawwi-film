-- Enable RLS on clients table
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- CLIENTS POLICIES

-- Policy: Admins can view all clients
CREATE POLICY "Admins can view all clients"
ON clients FOR SELECT
TO authenticated
USING (is_admin_user());

-- Policy: Users can view their own clients
CREATE POLICY "Users can view their own clients"
ON clients FOR SELECT
TO authenticated
USING (auth.uid() = created_by);

-- Policy: Admins can manage (insert/update/delete) all clients
CREATE POLICY "Admins can manage all clients"
ON clients FOR ALL
TO authenticated
USING (is_admin_user())
WITH CHECK (is_admin_user());

-- Policy: Users can insert own clients
CREATE POLICY "Users can insert own clients"
ON clients FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- Policy: Users can update own clients
CREATE POLICY "Users can update own clients"
ON clients FOR UPDATE
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- Policy: Users can delete own clients
CREATE POLICY "Users can delete own clients"
ON clients FOR DELETE
TO authenticated
USING (auth.uid() = created_by);


-- SCRIPTS POLICIES

-- Enable RLS on scripts table
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all scripts
CREATE POLICY "Admins can view all scripts"
ON scripts FOR SELECT
TO authenticated
USING (is_admin_user());

-- Policy: Users can view own or assigned scripts
-- Note: Cast both sides to text to handle mixed UUID/Text column types safely
CREATE POLICY "Users can view own or assigned scripts"
ON scripts FOR SELECT
TO authenticated
USING (
  created_by::text = auth.uid()::text
  OR 
  assignee_id::text = auth.uid()::text
);

-- Policy: Admins can manage all scripts
CREATE POLICY "Admins can manage all scripts"
ON scripts FOR ALL
TO authenticated
USING (is_admin_user())
WITH CHECK (is_admin_user());

-- Policy: Users can insert own scripts
CREATE POLICY "Users can insert own scripts"
ON scripts FOR INSERT
TO authenticated
WITH CHECK (created_by::text = auth.uid()::text);

-- Policy: Users can update own or assigned scripts
CREATE POLICY "Users can update own or assigned scripts"
ON scripts FOR UPDATE
TO authenticated
USING (
  created_by::text = auth.uid()::text
  OR 
  assignee_id::text = auth.uid()::text
)
WITH CHECK (
  created_by::text = auth.uid()::text
  OR 
  assignee_id::text = auth.uid()::text
);

-- Policy: Users can delete own scripts
CREATE POLICY "Users can delete own scripts"
ON scripts FOR DELETE
TO authenticated
USING (created_by::text = auth.uid()::text);
