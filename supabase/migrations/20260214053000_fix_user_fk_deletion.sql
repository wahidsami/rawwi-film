-- Migration to allow deleting users by setting created_by to NULL
-- Instead of blocking deletion (NO ACTION default).

DO $$
DECLARE
    constraint_name text;
BEGIN
    -- 1. CLIENTS Table
    -- Check if constraint exists (usually clients_created_by_fkey) or find it
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'clients'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'clients'::regclass AND attname = 'created_by')
    ];

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE clients DROP CONSTRAINT ' || constraint_name;
    END IF;

    -- Re-add constraint with ON DELETE SET NULL
    ALTER TABLE clients
    ADD CONSTRAINT clients_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

END $$;
