-- Private bucket for generated script certificate PDF files.

INSERT INTO storage.buckets (id, name, public)
VALUES ('script-certificates', 'script-certificates', false)
ON CONFLICT (id) DO NOTHING;
