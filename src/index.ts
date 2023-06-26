import * as https from 'node:https';
import * as querystring from 'node:querystring';
import * as readline from 'node:readline';
import * as url from 'node:url';
import * as dotenv from 'dotenv';

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

const getToken = (): string => {
    return process.env.TMDB_TOKEN;
};

const baseUrl = (): string => {
    return 'https://api.themoviedb.org/3/';
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


const mediaQuery = async(query: string, type: Media, page = 1): Promise<Search<Media> | void> => {
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

const fetch = (url: string): Promise<unknown> => {
    console.log('fetch url: ', url);
    const token = getToken();
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

const getUserInput = (input: readline.Interface, query: string): Promise<string> => {
    return new Promise((resolve) => {
        input.question(query, (answer) => {
            resolve(answer);
        });
    });
};

const handleUserInput = async (query: string, validResponses: string[]): Promise<string | void> => {
    const input = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const response = await getUserInput(input, query);

    input.close();

    if (!validResponses.includes(response)) {
        process.stdout.write('\r\x1b[K');
        return handleUserInput('Pick an option: ', validResponses);
    }

    return response;
};

const getAnswerFromUser = async (
    results: (MovieResult | TVResult)[],
    showMoreResults = false
): Promise<number | void> => {
    const validChoices: string[] = [];
    const resultsMap = new Map();
    let showMoreResultsOptNum;

    results.forEach((result, index) => {
        const optNum = (index + 1).toString();
        const title = 'title' in result ? result.title : result.name;
        const date = 'release_date' in result ? result.release_date : result.first_air_date;
        const year = new Date(date).getFullYear();

        validChoices.push((index + 1).toString());
        resultsMap.set(optNum, result);

        process.stdout.write(`${optNum}. ${title} (${year})\n`);
    });

    if (showMoreResults) {
        showMoreResultsOptNum = (results.length + 1).toString();
        validChoices.push(showMoreResultsOptNum);
        process.stdout.write(`${results.length + 1}. [SHOW MORE RESULTS]\n`);
    }

    const choice = await handleUserInput('Pick an option: ', validChoices);
    const result = resultsMap.get(choice);

    if (result) {
        return result.id;
    }
};

const userSearch = async (query: string, type: Media, page: number): Promise<MovieDetails | TVDetails | void> => {
    const search = await mediaQuery(query, type, page);
    
    if (search) {
        const { results, total_pages } = search;
        const currentPage = page;
        const showMoreResults = currentPage < total_pages;
        const id = await getAnswerFromUser(results, showMoreResults);
    
        if (id) {
            return getMediaById(id, type);
        } else if (showMoreResults && currentPage < total_pages){
            return userSearch(query, type, currentPage + 1);
        }
    }
};

const getPosterUrl = (posterPath: string): string => {
    const baseUrl = new URL(posterBaseUrl());
    return baseUrl.href + posterPath;
};

// (async (): Promise<void> => {
//     const movie = await userSearch('terminator', 'movie', 1) as MovieDetails;
//     const tv = await userSearch('pantheon', 'tv', 1) as TVDetails;

//     if (movie) {
//         const { title, imdb_id, poster_path } = movie;
//         console.log('title: ', title);
//         console.log('imdb_id: ', imdb_id);
//         console.log('poster: ', getPosterUrl(poster_path));
//     }

//     if (tv) {
//         const { name, poster_path } = tv;
//         console.log('title: ', name);
//         console.log('poster: ', getPosterUrl(poster_path));
//     }
// })();
