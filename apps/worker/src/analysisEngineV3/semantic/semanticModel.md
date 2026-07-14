# Semantic Model

This file defines the semantic state objects used by the Semantic Interpretation Layer.

The model is descriptive, not legal.

## 1. Semantic Meaning

Semantic Meaning is the normalized interpretation of what the text is saying in context.

Possible values:

- direct statement
- quoted statement
- narrated description
- reported speech
- paraphrase
- command
- warning
- threat
- joke
- sarcasm
- irony
- satire
- documentary mention
- historical mention
- educational mention
- fictional mention
- ambiguous
- unknown

## 2. Narrative Intent

Narrative Intent is the apparent purpose of the sentence within the scene.

Possible values:

- approval
- condemnation
- neutrality
- observation
- instruction
- promotion
- threat
- mockery
- praise
- warning
- education
- humor
- fiction
- reality
- unknown

## 3. Conversation Role

Conversation Role describes how the sentence functions in a conversation.

Possible values:

- speaker line
- listener response
- third-party mention
- narrator aside
- group address
- report
- testimony
- quote
- unknown

## 4. Scene Role

Scene Role describes what the sentence does in the scene.

Possible values:

- exposition
- action
- dialogue
- description
- flashback
- dream
- documentary
- news
- instruction
- satire
- comedy
- report
- unknown

## 5. Speaker

The apparent source of the sentence.

Possible values:

- explicit character
- implied character
- narrator
- institutional voice
- quoted source
- unknown

## 6. Listener

The apparent recipient of the sentence.

Possible values:

- explicit listener
- implied listener
- group
- self
- public
- unknown

## 7. Target

The person, group, institution, event, or idea the sentence is about.

## 8. Victim

The party harmed, targeted, mocked, or threatened by the sentence when such a role is supported by the context.

## 9. Emotion

The emotional coloring of the sentence.

Possible values:

- anger
- fear
- sadness
- joy
- mockery
- hostility
- affection
- neutrality
- irony
- confusion
- unknown

## 10. Risk Context

Risk Context is the semantic situation that may later matter to legal reasoning.

Possible values:

- low-risk mention
- quoted harmful content
- condemned harmful content
- endorsed harmful content
- educational usage
- documentary usage
- fictional usage
- ambiguous usage
- unknown

## 11. Confidence

Confidence is the strength of the semantic interpretation.

It is not legal confidence.

## 12. Semantic State

A semantic state is the combination of:

- semantic meaning
- narrative intent
- conversation role
- scene role
- target
- victim
- speaker
- listener
- emotion
- risk context
- confidence

