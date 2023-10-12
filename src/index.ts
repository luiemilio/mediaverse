import * as https from 'node:https';
import * as querystring from 'node:querystring';
import * as readline from 'node:readline';
import * as dotenv from 'dotenv';
import * as TelegramBot from 'node-telegram-bot-api';
import { InlineQueryResultPhoto } from 'node-telegram-bot-api';

dotenv.config();

type Media = 'movie' | 'tv';

// type MediaDetails<T> = T extends 'movie' ? MovieDetails : T extends 'tv' ? TVDetails : never;
type MediaResult<T> = T extends 'movie' ? MovieResult : T extends 'tv' ? TVResult : never;

interface Search<MediaType> {
    page: number;
    results: MediaResult<MediaType>[];
    total_pages: number;
    total_results: number;
}

interface BaseMediaResult {
    adult: boolean;
    backdrop_path: string;
    genre_ids: number[];
    id: number;
    original_language: string;
    overview: string;
    popularity: number;
    poster_path: string;
    vote_average: number;
    vote_count: number;
}

interface BaseMediaDetails extends Omit<BaseMediaResult, 'genre_ids'> {
    genres: GenreDetails[];
    homepage: string;
    spoken_languages: SpokenLanguageDetails[];
    production_companies: ProductionCompanyDetails[];
    production_countries: ProductionCountryDetails[];
    tagline: string;
    status: string;
}

interface MovieResult extends BaseMediaResult {
    original_title: string;
    release_date: string;
    title: string;
    video: boolean;
}

interface TVResult extends BaseMediaResult {
    origin_country: string[];
    original_name: string;
    first_air_date: string;
    name: string;
}

type BaseMovieDetails = MovieResult & BaseMediaDetails;

interface MovieDetails extends BaseMovieDetails {
    belongs_to_collection: string;
    budget: number;
    imdb_id: string;
    revenue: number;
    runtime: number;
    status: string;
}

type BaseTVDetails = TVResult & BaseMediaDetails;

interface TVDetails extends BaseTVDetails {
    created_by: CreatedByDetails[];
    episode_run_time: [];
    in_production: boolean;
    languages: string[];
    last_air_date: string;
    last_episode_to_air: EpisodeDetails;
    next_episode_to_air: EpisodeDetails;
    networks: NetworkDetails[];
    number_of_episodes: number;
    number_of_seasons: number;
    seasons: SeasonDetails[];
    type: string;
}

interface SeasonDetails {
    air_date: string;
    episode_count: number;
    id: number;
    name: string;
    overview: string;
    poster_path: string;
    season_number: number;
}

interface CreatedByDetails {
    id: number;
    credit_id: number;
    name: string;
    gender: number;
    profile_path: string;
}

interface EpisodeDetails {
    id: number;
    name: string;
    overview: string;
    vote_average: number;
    vote_count: number;
    air_date: string;
    episode_number: number;
    production_code: number;
    runtime: number;
    season_number: number;
    show_id: number;
    still_path: string;
}

interface NetworkDetails {
    id: number;
    logo_path: string;
    name: string;
    origin_country: string;
}

interface GenreDetails {
    id: number;
    name: string;
}

interface ProductionCompanyDetails {
    id: number;
    logo_path: string;
    name: string;
    origin_country: string;
}

interface ProductionCountryDetails {
    iso_3166_1: string;
    name: string;
}

interface SpokenLanguageDetails {
    english_name: 'string';
    iso_3166_1: string;
    name: string;
}

const WATCH_PROVIDERS = new Map();

const getTMDBToken = (): string => {
    return process.env.TMDB_TOKEN;
};

const getTGToken = (): string => {
    return process.env.TELEGRAM_TOKEN;
};

const baseUrl = (): string => {
    return 'https://api.themoviedb.org/3';
};

const posterBaseUrl = (): string => {
    return 'https://image.tmdb.org/t/p/w600_and_h900_bestv2';
};

const movieQuery = async (queryString: string): Promise<Search<'movie'>> => {
    const url = `${baseUrl()}/search/movie?${queryString}`;
    const results = (await fetch(url)) as Search<'movie'>;
    return results;
};

const tvQuery = async (queryString: string): Promise<Search<'tv'>> => {
    const url = `${baseUrl()}/search/tv?${queryString}`;
    const results = (await fetch(url)) as Search<'tv'>;
    return results;
};

const mediaQuery = async (query: string, type: Media, page = 1): Promise<Search<Media> | undefined> => {
    const queryString = querystring.stringify({ query, include_adult: false, language: 'en-US', page });

    switch (type) {
        case 'movie': {
            return movieQuery(queryString);
        }

        case 'tv': {
            return tvQuery(queryString);
        }

        default: {
            break;
        }
    }
};

const getMediaById = async (id: number, type: string): Promise<MovieDetails | TVDetails> => {
    const url = `${baseUrl()}/${type}/${id}`;
    return fetch(url) as unknown as MovieDetails | TVDetails;
};

const getWatchProvidersByMediaId = async (id: number, type: string): Promise<any> => {
    const url = `${baseUrl()}/${type}/${id}/watch/providers`;
    return fetch(url);
};

const getWatchProviders = async (type: Media): Promise<any> => {
    if (!WATCH_PROVIDERS.has(type)) {
        const url = `${baseUrl()}/watch/providers/${type}?language=en-US&watch_region=US'`;
        WATCH_PROVIDERS.set(type, await fetch(url));
    };

    return WATCH_PROVIDERS.get(type);
};

const fetch = (url: string): Promise<unknown> => {
    console.log('fetch url: ', url);
    const token = getTMDBToken();
    const options = {
        headers: {
            Authorization: `Bearer ${token}`,
            accept: 'application/json'
        }
    };

    return new Promise((resolve, reject) => {
        const request = https.get(url, options, (res) => {
            if (res.statusCode >= 200 || res.statusCode <= 299) {
                let body = '';

                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (error) {
                        reject(error);
                    }
                });
            } else {
                reject(`Request could not be made. Status code: ${res.statusCode}`);
            }
        });

        request.on('error', reject);
    });
};

const getPosterUrl = (posterPath: string): string => {
    const baseUrl = new URL(posterBaseUrl());
    return baseUrl.href + posterPath;
};


const escapeRegExp = (text: string): string => {
    return text.replace(/[-[\]{}()*+!?.,\\^$|#\s]/g, '\\$&');
};

const getInlineResultsMap = async (
    query: string,
    type: Media
): Promise<TelegramBot.InlineQueryResultArticle[] | undefined> => {
    const search = await mediaQuery(query, type);
    const { results } = search;

    if (!results) {
        return;
    }

     const resultsPromises = results
        .slice(0, 10)
        .filter((result) => {
            switch (type) {
                case 'movie': {
                    return 'title' in result;
                }

                case 'tv': {
                    return 'name' in result;
                }

                default: {
                    break;
                }
            }
        })
        .map(async (result) => {
            const { poster_path, id } = result;
            let title;
            let date;
            let watch = '';

            switch (type) {
                case 'movie': {
                    title = 'title' in result ? result.title : undefined;
                    date = 'title' in result ? result.release_date : undefined;
                    break;
                }

                case 'tv': {
                    title = 'name' in result ? result.name : undefined;
                    date = 'first_air_date' in result ? result.first_air_date : undefined;
                    break;
                }

                default: {
                    break;
                }
            }
            const year = date ? new Date(date).getFullYear() : undefined;
            // const thumbnail_url = poster_path && typeof poster_path === 'string' ? getPosterUrl(poster_path) : undefined;
            const providers = await getWatchProvidersByMediaId(id, type);
            const { results } = providers;

            if (providers?.results && providers.results?.US) {
                const { US } = results;

                if (US?.flatrate) {
                    watch += 'Streaming on:\n';

                    US.flatrate.forEach((service: any) => {
                        watch += `${service.provider_name}\n`;
                    });
                }
            }
            

            const message_text = escapeRegExp(`${title} (${year})\n\n${watch}`);

            const inlineResult = {
                id,
                type: 'article',
                title: `${title} (${year})`,
                input_message_content: {
                    parse_mode: 'MarkdownV2',
                    message_text
                }
            };

            console.log(inlineResult);
            return inlineResult;
        });

        return Promise.all(resultsPromises) as unknown as Promise<TelegramBot.InlineQueryResultArticle[]>;
};

const getInlineResults = async (query: string): Promise<TelegramBot.InlineQueryResultArticle[]> => {
    const movies = await getInlineResultsMap(query, 'movie');
    const tv = await getInlineResultsMap(query, 'tv');
    const inlineResults = [...movies, ...tv];

    return inlineResults;
};

(async (): Promise<void> => {
    const tgToken = getTGToken();
    const bot = new TelegramBot(tgToken, { polling: true });
    bot.clearReplyListeners();
    bot.clearTextListeners();

    bot.on('inline_query', async (inlineQuery) => {
        console.log('hey');
        const { query, id } = inlineQuery;
        const results = await getInlineResults(query);
        console.log('results length: ', results.length);

        if (results.length > 0) {
            bot.answerInlineQuery(id, results, { cache_time: 0 });
        }
    });
})();
