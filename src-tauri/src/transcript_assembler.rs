use std::collections::BTreeMap;
use std::sync::Mutex;

pub struct TranscriptAssemblerState {
    pub expected_chunk: usize,
    pub merged_transcript: String,
    pub pending_chunks: BTreeMap<usize, String>,
}

pub struct TranscriptAssembler {
    pub state: Mutex<TranscriptAssemblerState>,
}

impl TranscriptAssembler {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(TranscriptAssemblerState {
                expected_chunk: 0,
                merged_transcript: String::new(),
                pending_chunks: BTreeMap::new(),
            }),
        }
    }

    pub fn reset(&self) {
        let mut state = self.state.lock().unwrap();
        state.expected_chunk = 0;
        state.merged_transcript.clear();
        state.pending_chunks.clear();
        println!("[Assembler] State reset.");
    }

    pub fn submit(&self, chunk_index: usize, text: String) {
        let mut state = self.state.lock().unwrap();
        let trimmed = text.trim().to_string();
        
        // Stash chunk in pending map (if empty, store empty to keep track)
        state.pending_chunks.insert(chunk_index, trimmed);
        println!("[Assembler] Submitted chunk {} (pending count: {})", chunk_index, state.pending_chunks.len());

        // Process in-order chunks
        loop {
            let next_idx = state.expected_chunk;
            if let Some(pending_text) = state.pending_chunks.remove(&next_idx) {
                if !pending_text.is_empty() {
                    if state.merged_transcript.is_empty() {
                        state.merged_transcript = pending_text;
                    } else {
                        state.merged_transcript = merge_into_transcript(&state.merged_transcript, &pending_text);
                    }
                }
                println!("[Assembler] Merged chunk {} (current len: {})", state.expected_chunk, state.merged_transcript.len());
                state.expected_chunk += 1;
            } else {
                break;
            }
        }
    }

    pub fn get_transcript(&self) -> String {
        let state = self.state.lock().unwrap();
        state.merged_transcript.clone()
    }

    pub fn is_complete(&self, tail_idx: usize) -> bool {
        let state = self.state.lock().unwrap();
        state.expected_chunk >= tail_idx + 1
    }
}

pub fn merge_into_transcript(existing: &str, new_chunk: &str) -> String {
    let trimmed_existing = existing.trim();
    let trimmed_new = new_chunk.trim();
    if trimmed_existing.is_empty() {
        return trimmed_new.to_string();
    }
    if trimmed_new.is_empty() {
        return trimmed_existing.to_string();
    }

    let result_words: Vec<&str> = trimmed_existing.split_whitespace().collect();
    let text_words: Vec<&str> = trimmed_new.split_whitespace().collect();

    // Limit overlap comparison to a maximum of 12 words
    let max_overlap = std::cmp::min(12, std::cmp::min(result_words.len(), text_words.len()));
    let mut best_overlap = 0;

    for overlap_len in 1..=max_overlap {
        let suffix = &result_words[result_words.len() - overlap_len..];
        let prefix = &text_words[..overlap_len];

        let mut match_count = 0;
        for j in 0..overlap_len {
            let w1 = suffix[j].to_lowercase().trim_matches(|c: char| c.is_ascii_punctuation() || c.is_whitespace()).to_string();
            let w2 = prefix[j].to_lowercase().trim_matches(|c: char| c.is_ascii_punctuation() || c.is_whitespace()).to_string();
            if w1 == w2 {
                match_count += 1;
            }
        }
        if match_count == overlap_len {
            best_overlap = overlap_len;
        }
    }

    let new_words = &text_words[best_overlap..];
    let mut result = trimmed_existing.to_string();
    if !new_words.is_empty() {
        result.push(' ');
        result.push_str(&new_words.join(" "));
    }
    result
}
